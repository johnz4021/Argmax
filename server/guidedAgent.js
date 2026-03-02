// Guided problem-solving agent — conversational flow for problem classification and solving

import Anthropic from '@anthropic-ai/sdk';
import { tools } from './tools.js';
import { ALGORITHMS, runRegisteredAlgorithm } from './algorithms/registry.js';
import { handleToolCall, sendJSON, sendBinary } from './agent.js';
import { synthesizeAndStream } from './tts.js';
import { treeToPromptText } from './classificationTree.js';
import { CANONICAL_EXAMPLES } from './examples/canonicalExamples.js';
import { getDefaultContextPanels } from './contextPanelDefaults.js';
import { layoutGrid } from './graphLayout.js';
import { RENDERER_MANIFEST, buildRendererDocs } from './rendererManifest.js';
import { solveProblem } from './solver.js';

const anthropic = new Anthropic({ maxRetries: 5 });

// Build algorithm list dynamically from registry
function buildAlgorithmList() {
  return Object.entries(ALGORITHMS)
    .map(([id, info]) => `- ${id} (${info.category}, renderer: ${info.renderer})`)
    .join('\n');
}

const GUIDED_SYSTEM_PROMPT = `You are Argmax, an expert algorithm tutor. A student has pasted a problem and you will guide them through solving it via conversation.

YOUR ROLE: Have a natural back-and-forth dialogue with the student to classify the problem, optionally refresh them on the algorithm, then build the algorithm input together incrementally.

AVAILABLE ALGORITHMS (this is your HARD BOUNDARY):
${buildAlgorithmList()}

CLASSIFICATION TREE (use this to guide your send_options questions):
${treeToPromptText()}

CONVERSATIONAL FLOW:

STAGE 0 — REASONING MODE (1-2 exchanges):
  Before classifying an algorithm, determine WHAT TYPE OF REASONING the problem requires.
  Use send_options with the top-level classification tree question.

  Modes:
  - algorithm_execution → existing flow (classify algorithm → refresh → reduce → run)
  - modeling → Modeling Template flow (see below)
  - greedy_design → Greedy Design flow
  - dp_design → DP Design flow
  - dc_design → Divide-and-Conquer flow
  - runtime → Runtime Analysis flow

  Call classify_problem with the reasoning_mode once determined.

ALGORITHM EXECUTION MODE (existing flow):
  1. CLASSIFY algorithm (2-4 exchanges using the algorithm subtree)
  2. REFRESH (optional — offer canonical example)
  3. REDUCTION SKETCH (build input → run algorithm → narrate → verify)

MODELING MODE (LP, reductions, duality):
  Problems that ask "write an LP," "define variables," "take a dual," or "reduce X to Y."

  Follow the Modeling Template:
  1. OBJECTS — Ask "What are the decision variables?"
     Call create_visualization with context_panels containing an expression panel
     with initial_data that has the first line (variables).
     Also set up the example graph via update_graph if applicable.
  2. OBJECTIVE — Ask "What is being optimized?"
     Use emit_segment with viz_actions to update the formulation panel (add objective line)
     and highlight relevant graph edges.
  3. CONSTRAINTS — Ask "What constraints must hold?"
     Update panel with each new constraint line. Highlight graph structures that
     correspond to each constraint.
  4. TRICK — "Is there a transformation needed?" (absolute value linearization, graph layering, etc.)
  5. SANITY CHECK — "Does this enforce exactly what the problem states? Missing anything?"

  IMPORTANT: Each panel update must include ALL accumulated lines, not just the new one.
  IMPORTANT: Use emit_segment viz_actions with renderer:"graph" to highlight — do NOT
  just say "let me highlight" without sending actual highlight actions.
  Do NOT call run_algorithm unless the student explicitly asks.
  The related algorithm provides context, not execution.

GREEDY DESIGN MODE:
  1. RULE — Guide student to propose the greedy criterion
  2. PROOF STRUCTURE — Set up an expression panel with exchange argument skeleton via
     create_visualization with initial_data:
     - Assume optimal solution O differs from greedy solution G
     - Find first point of difference
     - Show swapping doesn't worsen the solution
  3. WALK THROUGH — Use a concrete example on the graph/array to illustrate.
     Use emit_segment viz_actions with renderer:"graph" to highlight relevant elements.
  4. RUNTIME — Analyze the greedy algorithm's complexity

DP DESIGN MODE:
  1. SUBPROBLEM — "What does dp[i] (or dp[i][j]) represent?"
  2. RECURRENCE — Use create_visualization to set up an expression panel with initial_data,
     then update via emit_segment viz_actions as the recurrence is built.
  3. BASE CASES — Identify boundary conditions
  4. ORDER — "In what order do we fill the table?"
  5. RUNTIME — Analyze from table dimensions
  Optionally run the algorithm on a small example if one exists in the registry.

DIVIDE-AND-CONQUER MODE:
  1. SPLIT — How to divide the input
  2. SUBPROBLEMS — What recursive calls are made
  3. COMBINE — How to merge subproblem results
  4. RECURRENCE — Write T(n) = ... and solve it

RUNTIME / ASYMPTOTICS MODE:
  1. Identify what bound is needed (upper, lower, tight)
  2. For recurrences: identify which method applies (Master theorem, substitution, recursion tree)
  3. Walk through the proof steps using expression panels.
     Use emit_segment viz_actions with renderer:"context" to display recurrence steps.
  4. Use concrete values to build intuition

HANDLING STUDENT MESSAGES:
- Messages tagged [STUDENT MESSAGE] are first-class conversation continuations.
- The student may answer in free text instead of clicking options — incorporate naturally.
- When a student answers a send_options question, you'll get the result in the tool response.
- If the student gives a wrong answer, provide a conceptual nudge (not the answer) and try again.

SOCRATIC DIALOGUE MODE:
  Triggers — use conversational_reply (NOT emit_segment) when the student:
  1. Asks a why/how question: "why does X work?", "how does X apply here?"
  2. Expresses uncertainty: "I'm not sure", "can you explain?", "I don't know",
     "I don't get it", "help me understand", "what do you mean?", "I'm confused"

  For why/how questions:
  - Pose a 1-2 sentence counter-question guiding them toward the insight.
  - Examples:
    - Student: "Why do we minimize total flow?"
      → conversational_reply("What would happen if we set all flows to zero —
         would that satisfy our demand constraint?")
    - Student: "How does this connect to shortest paths?"
      → conversational_reply("When all capacities are 1, can the optimal flow
         ever split across multiple paths? What does that tell you?")

  For uncertainty signals:
  - Start with the simplest sub-question that builds toward understanding.
  - Break the concept into 2-3 small conversational_reply exchanges, each
    building on the student's previous answer.
  - Examples:
    - Student: "I'm not sure what the constraint means"
      → conversational_reply("Let's start simple — at a node that isn't s or t,
         what should the total flow in vs. flow out be?")
    - Student: "Can you explain the objective?"
      → conversational_reply("We have flow on each edge and each edge has a cost.
         If you wanted to spend as little as possible, what would you minimize?")

  Limits:
  - Max 3 conversational_reply exchanges per Socratic sequence.
  - If the student is still stuck after 3, give ONE concise emit_segment
    (1-2 sentences) with the direct answer. Do NOT chain multiple emit_segments.
  - Anti-patterns to avoid: paragraphs of explanation, "Think of it this way..."
    + 3 sentences, restating the same point, preemptively answering follow-ups.
  - If the message is not conceptual (e.g., "go back", "skip"), use normal flow.

MONOLOGUE CAP:
- HARD RULE: Never emit more than 2 consecutive emit_segments without student input.
- After 2 consecutive emit_segments, you MUST pause and do one of:
  (a) conversational_reply with a comprehension check
      (e.g., "Does that make sense so far?" or "What do you think happens next?")
  (b) send_options to let the student choose what to explore next
- This applies in ALL modes: modeling, execution, refresher, greedy/DP design.
- The count resets whenever the student provides input (via send_options response,
  conversational_reply response, or a [STUDENT MESSAGE]).

VERIFICATION:
- If the problem provides sample input/output, you MUST call verify_result after running the algorithm.
- If the result mismatches: "Our answer doesn't match. My model has a bug — let me find it."
- A mismatch with sample output is ALWAYS a modeling error.

INPUT SIZE LIMITS:
- Max 12 nodes / 20 edges for graphs
- Max 15 elements for arrays
- Max 8x8 for DP tables
- If the problem exceeds these, build a smaller example for visualization.

SCOPE BOUNDARY HANDLING:
- LP / formulation → reasoning_mode: 'modeling'. The underlying algorithm provides context only.
- Proof of greedy correctness → reasoning_mode: 'greedy_design'.
- "Design a DP solution" → reasoning_mode: 'dp_design'.
- NP-completeness reduction → reasoning_mode: 'modeling' (reduction variant).
- Pure runtime analysis → reasoning_mode: 'runtime'.
- If completely out of scope, say so honestly.

GUARDRAILS:
- Never make up an algorithm trace. Always use run_algorithm.
- Keep classification phase concise — 2-4 questions max.
- Model Contract stays internal — never display it to students.
- Use emit_segment for all narration (same as standard teaching mode).
- Build input visually BEFORE running the algorithm.
- In non-execution modes (modeling, greedy_design, dp_design, dc_design, runtime),
  do NOT call run_algorithm unless the student explicitly asks to see it run.
- Use formal model panels (expression panels with lines mode) to keep structured
  information visible: variables, objective, constraints, recurrences, invariants.
- Set up panels via create_visualization with context_panels AND initial_data before narrating.
- When saying "let me highlight X", ALWAYS include corresponding viz_actions with
  renderer:"graph" actions. Never narrate highlighting without sending the actions.
- Each formulation panel update must include ALL accumulated lines (the array is replaced, not appended).
- MATH NOTATION: Use LaTeX notation wrapped in $...$ for all mathematical expressions,
  both in narration text (emit_segment) and in panel lines (text fields).
  Examples: $f_{uv}$, $\\sum_{e} c_e \\cdot f_e$, $d_{\\text{flow}}(s,t)$, $\\leq$, $\\geq$.
  Do NOT use plain Unicode symbols like Σ — use $\\Sigma$ or $\\sum$ instead.
  This applies to panel labels, panel line text, and narration strings.

STUDENT-DOES-THE-WORK PRINCIPLE (all modes):
- Ask: is this computation/step the LEARNING OBJECTIVE or scaffolding?
- If it's the core of what the problem tests: prompt the student to do it.
  "What are the powers of 3 mod 7?" not "The powers are 3, 2, 6, 4, 5, 1."
  "What constraint ensures flow conservation?" not "Here's the conservation constraint."
- If it's scaffolding toward a bigger insight: just do it and keep moving.
  Quick arithmetic, bookkeeping, or setup steps are fine to handle yourself.
- "I'm not sure" means ask a simpler question first, not take over.
  Only do the work yourself after prompting and the student is still stuck.


TOOL USAGE FOR NON-EXECUTION MODES:

A. Creating an expression panel with initial content:
  To set up a formal model panel, call create_visualization with initial_data containing lines:
    create_visualization({
      panels: [],
      context_panels: [{
        id: "formulation",
        type: "expression",
        title: "LP Formulation",
        initial_data: {
          label: "LP: Flow Distance",
          lines: [{ label: "Variables", text: "$f_{uv}$ for each directed edge $(u,v)$" }]
        }
      }]
    })

B. Updating the panel incrementally as you build the formulation:
  To add lines to an existing panel, use emit_segment with a context viz_action.
  NOTE: lines is an array — each update must include ALL lines accumulated so far.
    emit_segment({
      narration: "Now let's add the objective...",
      viz_actions: [{
        renderer: "context",
        action: "update",
        params: {
          panel_id: "formulation",
          label: "$\\text{LP: Flow Distance}$",
          lines: [
            { label: "Variables", text: "$f_{uv}$ for each directed edge $(u,v)$" },
            { label: "$\\min$", text: "$\\sum_e c_e \\cdot f_e$", highlight: true }
          ]
        }
      }]
    })

C. Visualizing with any renderer in non-execution mode:
  Mount a renderer panel, then send viz_actions via emit_segment.
  Setup: create_visualization({ panels: [{ renderer: "<type>" }], context_panels: [...] })
  You can mount multiple renderer panels for problems needing more than one (e.g. table + graph).

  Available renderers and actions:
  - graph: highlight_node, highlight_edge, mark_visited, mark_current, set_label, reset_highlights, show_path, update_edge_label
  - array: set_data, highlight, swap, compare, partition, place, mark_sorted, set_pointer, clear_pointers, slide_window, set_label, reset
  - table: init_grid, fill_cell, highlight_cell, highlight_row, highlight_col, show_dependency_arrow, clear_dependency_arrows, set_row_header, set_col_header, mark_optimal, reset
  - tree: set_tree, highlight_node, highlight_edge, insert_node, delete_node, rotate_left, rotate_right, recolor_node, sift_up, sift_down, mark_level, update_heap_array, reset
  - linked: set_list, highlight_node, highlight_pointer, insert_after, delete_node, reverse_segment, push, pop, enqueue, dequeue, set_pointer, reset

  Call get_renderer_docs to get full parameter docs, classNames, and examples for any renderer(s) you need.

CONFIDENCE CALIBRATION:
- Single well-known reduction → narrate confidently.
- Multi-step reduction → justify each step.
- Revised model → teach the revision: "I initially thought X, but that misses Y."
- Unverified assumptions → use hedged language.

SEGMENT BUDGETING:
- Reasoning mode classification: 1-2 segments + 1 send_options
- Algorithm classification (if execution mode): 2-4 segments + 1-2 send_options
- Refresher: 5-8 segments (if requested)
- Modeling template: 2-3 segments per step (objects, objective, constraints, trick, sanity)
- Greedy/DP/DC design: 2-3 segments per step
- Execution: 10-20 segments (standard teaching)
- Verification: 1-2 segments
- Socratic dialogue: 0 segments (uses conversational_reply, not emit_segment)`;

// Tools specific to guided mode
const guidedTools = [
  ...tools,
  {
    name: 'classify_problem',
    description:
      'Called after classifying the student\'s problem through conversation. Records which algorithm to use and the internal model contract (kept internal, not shown to student).',
    input_schema: {
      type: 'object',
      properties: {
        reasoning_mode: {
          type: 'string',
          enum: ['algorithm_execution', 'modeling', 'greedy_design', 'dp_design', 'dc_design', 'runtime'],
          description: 'The type of reasoning this problem requires',
        },
        is_in_scope: {
          type: 'boolean',
          description: 'Whether the problem maps to an available algorithm',
        },
        target_algorithm: {
          type: 'string',
          description: 'Algorithm ID from registry (e.g., "dijkstra", "knapsack"), or "out_of_scope". Required for algorithm_execution mode.',
        },
        closest_algorithm: {
          type: 'string',
          description: 'If out of scope or non-execution mode, the closest available algorithm for context',
        },
        problem_summary: {
          type: 'string',
          description: 'One-sentence summary of what the problem is asking',
        },
        key_insight: {
          type: 'string',
          description: 'The main modeling insight the student needs to discover',
        },
        internal_model_contract: {
          type: 'object',
          description: 'Internal reasoning about the reduction — NOT shown to students',
          properties: {
            state_definition: { type: 'string' },
            transition_rules: { type: 'string' },
            cost_model: { type: 'string' },
            feasibility_constraints: { type: 'string' },
            assumptions_to_verify: {
              type: 'array',
              items: { type: 'string' },
            },
          },
          required: ['state_definition', 'transition_rules', 'cost_model', 'feasibility_constraints', 'assumptions_to_verify'],
        },
      },
      required: ['reasoning_mode', 'is_in_scope', 'problem_summary', 'key_insight', 'internal_model_contract'],
    },
  },
  {
    name: 'show_canonical_example',
    description:
      'Show a pre-built canonical example for an algorithm as a quick refresher. Runs the algorithm and sets up visualization automatically.',
    input_schema: {
      type: 'object',
      properties: {
        algorithm: {
          type: 'string',
          description: 'Algorithm ID to show a canonical example for',
        },
      },
      required: ['algorithm'],
    },
  },
  {
    name: 'verify_result',
    description:
      'Verify the algorithm result against expected sample output from the problem.',
    input_schema: {
      type: 'object',
      properties: {
        expected: {
          description: 'The expected result from the problem statement',
        },
        computed: {
          description: 'The result computed by the algorithm',
        },
        comparison_type: {
          type: 'string',
          enum: ['exact', 'numeric', 'set'],
          description: 'How to compare: exact string match, numeric tolerance, or set equality',
        },
      },
      required: ['expected', 'computed', 'comparison_type'],
    },
  },
  {
    name: 'conversational_reply',
    description: 'Send a short Socratic counter-question or conversational nudge (1-2 sentences). Use instead of emit_segment when responding to student why/how questions.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The reply or counter-question (1-2 sentences max)' },
        wait_for_response: { type: 'boolean', description: 'Wait for student reply before continuing. Default true.' },
      },
      required: ['text'],
    },
  },
  {
    name: 'get_renderer_docs',
    description: 'Get full documentation (params, classNames, examples) for one or more visualization renderers. Call this before constructing viz_actions for a renderer you haven\'t used yet.',
    input_schema: {
      type: 'object',
      properties: {
        renderers: {
          type: 'array',
          items: { type: 'string', enum: ['graph', 'array', 'table', 'tree', 'linked'] },
          description: 'Which renderer(s) to get docs for',
        },
      },
      required: ['renderers'],
    },
  },
];

// Input size validation
function validateInputSize(input, algorithm) {
  const warnings = [];
  const algoInfo = ALGORITHMS[algorithm];
  if (!algoInfo) return warnings;

  if (algoInfo.renderer === 'graph') {
    if (input?.graph?.nodes?.length > 12) {
      warnings.push(`Graph has ${input.graph.nodes.length} nodes (max 12 for visualization). Consider using a smaller example.`);
    }
    if (input?.graph?.edges?.length > 20) {
      warnings.push(`Graph has ${input.graph.edges.length} edges (max 20 for visualization). Consider using a smaller example.`);
    }
  }
  if (algoInfo.renderer === 'array') {
    if (input?.array?.length > 15) {
      warnings.push(`Array has ${input.array.length} elements (max 15 for visualization). Consider using a smaller example.`);
    }
  }
  if (algoInfo.renderer === 'table') {
    if (algorithm === 'knapsack' && input?.items?.length > 8) {
      warnings.push(`${input.items.length} items would create a large DP table (max 8 for visualization).`);
    }
    if ((algorithm === 'lcs' || algorithm === 'edit_distance') && (input?.str1?.length > 8 || input?.str2?.length > 8)) {
      warnings.push(`String lengths exceed 8 characters, creating a large DP table. Consider using shorter strings.`);
    }
  }
  return warnings;
}

/**
 * Compare two values for verification.
 */
function compareResults(expected, computed, type) {
  switch (type) {
    case 'numeric': {
      const e = Number(expected);
      const c = Number(computed);
      return Math.abs(e - c) < 1e-6;
    }
    case 'set': {
      const eSet = new Set(Array.isArray(expected) ? expected.map(String) : [String(expected)]);
      const cSet = new Set(Array.isArray(computed) ? computed.map(String) : [String(computed)]);
      if (eSet.size !== cSet.size) return false;
      for (const v of eSet) if (!cSet.has(v)) return false;
      return true;
    }
    case 'exact':
    default:
      return String(expected) === String(computed);
  }
}

function buildSolverContext(result) {
  let ctx = `

===== SOLVER CONTEXT (INTERNAL — NEVER REVEAL TO STUDENT) =====
OPTIMAL APPROACH: ${result.approach}
COMPLEXITY: ${result.complexity}
KEY INSIGHT: ${result.keyInsight}
SOLUTION: ${result.solution}
`;

  if (result.paradigmShift) {
    ctx += `
PARADIGM SHIFT ALERT — the obvious approach (${result.obviousApproach}) won't achieve the target complexity. Scaffold toward the non-obvious insight early. Do not let the student invest heavily in the wrong approach.
`;
  }

  ctx += `
RULES:
- Guide toward THIS verified approach
- Never mention you pre-solved it
- Still use Socratic method, but steer toward the known answer
=====`;

  return ctx;
}

export async function startGuidedSession(session, problemText, imageBase64, imageMimeType) {
  const { ws } = session;

  sendJSON(ws, { type: 'guided_start', problemText });

  // Pre-teaching solver pass: solve the problem first to give the tutor a verified north star
  const statusCb = (label) => sendJSON(ws, { type: 'agent_status', status: 'tool', tool: label });
  let solverResult = null;
  try {
    solverResult = await solveProblem(problemText, statusCb, imageBase64, imageMimeType);
  } catch (err) {
    console.error('[Solver] Failed:', err.message);
  }

  const systemPrompt = solverResult?.success
    ? GUIDED_SYSTEM_PROMPT + buildSolverContext(solverResult)
    : GUIDED_SYSTEM_PROMPT;

  // Build user message content blocks (supports text, image, or both)
  const userContent = [];
  if (imageBase64 && imageMimeType) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: imageMimeType, data: imageBase64 },
    });
  }
  const textPart = problemText
    ? `Here is the problem the student wants to solve:\n\n${problemText}`
    : 'See the attached image for the problem the student wants to solve.';
  userContent.push({
    type: 'text',
    text: `${textPart}\n\nBegin by reading the problem carefully. Start a conversation with the student to classify which algorithm applies — use send_options with the classification tree. Do NOT call classify_problem until you've had 2-3 exchanges with the student.`,
  });

  const messages = [
    {
      role: 'user',
      content: userContent,
    },
  ];

  let sessionPlan = null;

  let continueLoop = true;
  while (continueLoop) {
    if (ws.readyState !== ws.OPEN) break;

    sendJSON(ws, { type: 'agent_status', status: 'thinking' });

    let response;
    try {
      response = await anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        tools: guidedTools,
        messages,
      });
    } catch (err) {
      console.error('[GuidedAgent] API error:', err.message);
      sendJSON(ws, { type: 'error', message: 'API request failed. Please try again.' });
      break;
    }

    console.log('[GuidedAgent] Response stop_reason:', response.stop_reason, 'content types:', response.content.map(b => b.type));

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      // If the model returned text without tool use, treat it as narration and prompt it to use tools
      const textBlocks = response.content.filter(b => b.type === 'text' && b.text?.trim());
      if (textBlocks.length > 0) {
        const narrationText = textBlocks.map(b => b.text).join('\n');
        sendJSON(ws, {
          type: 'segment_start',
          segment_id: 'guided_text_' + Date.now(),
          narration: narrationText,
          phase: 'Analyzing problem...',
          viz_actions: [],
        });
        // Push the model to use tools on the next turn
        messages.push({
          role: 'user',
          content: 'Continue guiding the student. Use send_options or emit_segment tools — do not respond with plain text.',
        });
        continue;
      }

      // Check if there are queued student messages before ending
      if (session.guidedMessageQueue && session.guidedMessageQueue.length > 0) {
        const queuedMessages = session.guidedMessageQueue.splice(0);
        for (const msg of queuedMessages) {
          messages.push({
            role: 'user',
            content: `[STUDENT MESSAGE] ${msg}`,
          });
        }
        continue;
      }
      continueLoop = false;
      sendJSON(ws, { type: 'lesson_complete' });
      break;
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults = [];
      let interrupted = false;

      const TOOL_LABELS = {
        classify_problem: 'Classifying problem',
        create_visualization: 'Creating visualization',
        emit_segment: null,
        send_options: null,
        conversational_reply: null,
        run_algorithm: 'Running algorithm',
        show_canonical_example: 'Loading example',
        update_graph: 'Building graph',
        get_renderer_docs: null,
        verify_result: 'Verifying result',
      };

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        const toolLabel = TOOL_LABELS[block.name];
        if (toolLabel) {
          sendJSON(ws, { type: 'agent_status', status: 'tool', tool: toolLabel });
        }

        let result;

        if (block.name === 'classify_problem') {
          const plan = block.input;
          sessionPlan = plan;
          session.modelContract = plan.internal_model_contract;
          session.reasoningMode = plan.reasoning_mode;

          const validAlgorithms = Object.keys(ALGORITHMS);
          if (plan.reasoning_mode === 'algorithm_execution' && plan.is_in_scope && plan.target_algorithm && !validAlgorithms.includes(plan.target_algorithm)) {
            result = {
              success: false,
              error: `Unknown algorithm: ${plan.target_algorithm}. Available: ${validAlgorithms.join(', ')}`,
            };
          } else {
            let message = plan.reasoning_mode === 'algorithm_execution'
              ? (plan.is_in_scope
                ? `Classification accepted. Target: ${plan.target_algorithm}. Internal model contract stored (NOT shown to student). Now offer a refresher via send_options, then proceed to the reduction sketch. If the problem has sample I/O, remember to call verify_result at the end.`
                : `Problem is out of scope. Closest algorithm: ${plan.closest_algorithm}. Guide the student with the closest available algorithm.`)
              : plan.reasoning_mode === 'modeling'
              ? `Classification accepted: MODELING MODE. Use the Modeling Template to guide the student. Set up a formal model panel via create_visualization. Do NOT call run_algorithm unless the student explicitly asks. Related algorithm: ${plan.closest_algorithm || plan.target_algorithm}.`
              : plan.reasoning_mode === 'greedy_design'
              ? `Classification accepted: GREEDY DESIGN MODE. Guide the student to: (1) propose a greedy rule, (2) prove it via exchange argument. Use a formal model panel for the invariant/exchange proof structure.`
              : plan.reasoning_mode === 'dp_design'
              ? `Classification accepted: DP DESIGN MODE. Guide the student to: (1) define subproblem, (2) write recurrence, (3) identify base cases, (4) analyze runtime. Use expression panels for the recurrence.`
              : plan.reasoning_mode === 'dc_design'
              ? `Classification accepted: DIVIDE-AND-CONQUER MODE. Guide: (1) identify split, (2) define subproblems, (3) combine step, (4) solve recurrence for runtime.`
              : `Classification accepted: RUNTIME/ASYMPTOTICS MODE. Guide through the proof structure: identify the bound, prove upper/lower, or solve the recurrence.`;

            // Auto-inject primary renderer docs for non-execution modes
            if (plan.reasoning_mode !== 'algorithm_execution') {
              const targetAlgo = plan.target_algorithm || plan.closest_algorithm;
              const algoInfo = targetAlgo ? ALGORITHMS[targetAlgo] : null;
              const rendererType = algoInfo?.renderer || 'graph';
              const rendererDocs = buildRendererDocs([rendererType]);
              message += `\n\nRENDERER REFERENCE (${rendererType}):\n${rendererDocs}`;
            }

            result = { success: true, message };
          }
        } else if (block.name === 'update_graph') {
          // Incremental graph construction
          const input = block.input;
          if (!session.currentGraph) {
            session.currentGraph = {
              nodes: [],
              edges: [],
              positions: {},
              directed: input.directed !== undefined ? input.directed : true,
            };
          }

          const graph = session.currentGraph;

          // Remove nodes
          if (input.remove_nodes) {
            const removeSet = new Set(input.remove_nodes);
            graph.nodes = graph.nodes.filter((n) => !removeSet.has(n.id));
            graph.edges = graph.edges.filter(
              (e) => !removeSet.has(e.source) && !removeSet.has(e.target)
            );
            for (const id of input.remove_nodes) {
              delete graph.positions[id];
            }
          }

          // Remove edges
          if (input.remove_edges) {
            for (const re of input.remove_edges) {
              graph.edges = graph.edges.filter(
                (e) => !(e.source === re.source && e.target === re.target)
              );
            }
          }

          // Add nodes
          if (input.add_nodes) {
            for (const node of input.add_nodes) {
              if (!graph.nodes.some((n) => n.id === node.id)) {
                graph.nodes.push({ id: node.id, label: node.label || node.id });
              }
            }
          }

          // Add edges
          if (input.add_edges) {
            for (const edge of input.add_edges) {
              if (!graph.edges.some((e) => e.source === edge.source && e.target === edge.target)) {
                graph.edges.push(edge);
              }
            }
          }

          // Update directedness
          if (input.directed !== undefined) {
            graph.directed = input.directed;
          }

          // Auto-layout new nodes
          graph.positions = layoutGrid(graph.nodes, graph.positions);

          // Send updated graph to client
          sendJSON(ws, { type: 'create_graph', graph });

          result = {
            success: true,
            node_count: graph.nodes.length,
            edge_count: graph.edges.length,
            message: `Graph updated: ${graph.nodes.length} nodes, ${graph.edges.length} edges. Displayed to student.`,
          };
        } else if (block.name === 'show_canonical_example') {
          const algo = block.input.algorithm;
          const example = CANONICAL_EXAMPLES[algo];

          if (!example) {
            result = { success: false, error: `No canonical example for algorithm: ${algo}` };
          } else {
            try {
              const runResult = runRegisteredAlgorithm(algo, example.input);
              const algoInfo = ALGORITHMS[algo];
              const contextPanels = getDefaultContextPanels(algo);

              // Store trace on session
              session.currentTrace = runResult.trace;
              session.currentRenderer = runResult.renderer;
              session.currentAlgorithm = algo;
              session.mapperState = {};

              // Auto-configure viz
              if (algoInfo.renderer === 'graph') {
                const graphData = example.input.graph || algoInfo.defaultInput?.graph;
                if (graphData) {
                  sendJSON(ws, { type: 'create_graph', graph: graphData });
                  session.currentGraph = graphData;
                }
                if (contextPanels.length > 0) {
                  sendJSON(ws, {
                    type: 'create_visualization',
                    panels: [],
                    context_panels: contextPanels,
                  });
                }
              } else {
                sendJSON(ws, {
                  type: 'create_visualization',
                  panels: [{ renderer: algoInfo.renderer, config: {} }],
                  context_panels: contextPanels,
                });
              }

              result = {
                success: true,
                algorithm: algo,
                description: example.description,
                teaching_notes: example.teaching_notes,
                trace: runResult.trace,
                step_count: runResult.trace.length,
                renderer: runResult.renderer,
                context_panels: contextPanels.map((p) => p.id),
                message: `Canonical example loaded for ${algo}. ${runResult.trace.length} trace steps available. Use emit_segment with trace_step_indices to narrate a brief refresher (5-8 segments). Teaching notes: ${example.teaching_notes}`,
              };
            } catch (err) {
              result = { success: false, error: err.message };
            }
          }
        } else if (block.name === 'verify_result') {
          const { expected, computed, comparison_type } = block.input;
          const matches = compareResults(expected, computed, comparison_type || 'exact');

          // Send verification result to client
          sendJSON(ws, {
            type: 'verification_result',
            expected,
            computed,
            matches,
            comparison_type: comparison_type || 'exact',
          });

          result = {
            success: true,
            matches,
            expected,
            computed,
            message: matches
              ? 'Result matches expected output. The reduction is correct!'
              : 'MISMATCH: Result does not match expected output. Your reduction has a bug. Re-examine your model contract assumptions and find the error. Tell the student: "Our answer doesn\'t match — my model has a bug. Let me find it."',
          };
        } else if (block.name === 'conversational_reply') {
          const { text, wait_for_response } = block.input;

          // Send as interrupt_response to reuse existing purple "Argmax:" segment
          sendJSON(ws, { type: 'interrupt_response', answer: text, explanation_mode: 'none' });

          // TTS for the reply
          const sendBinaryFn = (buffer) => sendBinary(ws, buffer);
          const sendJsonFn = (obj) => sendJSON(ws, obj);
          await synthesizeAndStream(sendBinaryFn, text, session.speedMultiplier, sendJsonFn);

          if (wait_for_response !== false) {
            // Activate input field and wait for student response
            sendJSON(ws, { type: 'guided_prompt', prompt: text });

            const responsePromise = new Promise((resolve) => {
              session.guidedResponseResolver = resolve;
            });
            const timeoutPromise = new Promise((resolve) => {
              setTimeout(() => resolve('__timeout__'), 600000);
            });

            const raceResult = await Promise.race([responsePromise, timeoutPromise]);

            session.guidedResponseResolver = null;

            if (raceResult === '__timeout__') {
              result = {
                student_response: null,
                timed_out: true,
                message: 'Student did not respond within 2 minutes. Move on with a brief explanation.',
              };
            } else if (raceResult === '__interrupted__') {
              result = {
                student_response: null,
                interrupted: true,
                message: 'Student interrupted with a question. The interrupt will be handled next.',
              };
            } else {
              const studentResponse = session.guidedResponse;
              session.guidedResponse = null;
              result = {
                student_response: studentResponse,
                timed_out: false,
                freeform_text: studentResponse?.text || null,
              };
            }
          } else {
            result = { success: true, message: 'Reply sent.' };
          }
        } else if (block.name === 'send_options') {
          // Handle send_options — send choices and wait for response
          const { prompt, options } = block.input;

          sendJSON(ws, { type: 'guided_options', prompt, options: block.input.options || [], mode: block.input.mode || 'mc', input_placeholder: block.input.input_placeholder });

          // TTS for the prompt
          const sendBinaryFn = (buffer) => sendBinary(ws, buffer);
          const sendJsonFn = (obj) => sendJSON(ws, obj);
          await synthesizeAndStream(sendBinaryFn, prompt, session.speedMultiplier, sendJsonFn);

          // Also send a guided_prompt so the student can type in the input field
          sendJSON(ws, { type: 'guided_prompt', prompt });

          // Wait for student response with 2-minute timeout
          const responsePromise = new Promise((resolve) => {
            session.guidedResponseResolver = resolve;
          });
          const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => resolve('__timeout__'), 600000);
          });

          const raceResult = await Promise.race([responsePromise, timeoutPromise]);

          session.guidedResponseResolver = null;

          if (raceResult === '__timeout__') {
            sendJSON(ws, { type: 'clear_guided_options' });
            result = {
              student_response: null,
              timed_out: true,
              message: 'Student did not respond within 2 minutes. Give them a hint and reveal the answer.',
            };
          } else if (raceResult === '__interrupted__') {
            sendJSON(ws, { type: 'clear_guided_options' });
            result = {
              student_response: null,
              interrupted: true,
              message: 'Student interrupted with a question. The interrupt will be handled next.',
            };
          } else {
            const studentResponse = session.guidedResponse;
            session.guidedResponse = null;
            sendJSON(ws, { type: 'clear_guided_options' });
            result = {
              student_response: studentResponse,
              timed_out: false,
              selected_option_id: studentResponse?.optionId || null,
              freeform_text: studentResponse?.text || null,
            };
          }
        } else if (block.name === 'get_renderer_docs') {
          result = { docs: buildRendererDocs(block.input.renderers) };
        } else if (block.name === 'run_algorithm') {
          sendJSON(ws, { type: 'guided_transition' });
          sendJSON(ws, { type: 'guided_phase', phase: 'executing' });
          result = await handleToolCall(session, block, null, sessionPlan?.target_algorithm, null);
        } else {
          // Delegate all other tools to shared handler
          result = await handleToolCall(session, block, null, sessionPlan?.target_algorithm, null);
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });

        // Check for pause after emit_segment or conversational_reply
        if ((block.name === 'emit_segment' || block.name === 'conversational_reply') && session.pauseFlag) {
          session.pauseFlag = false;
          sendJSON(ws, { type: 'paused' });
          await new Promise((resolve) => {
            session.pauseResolver = resolve;
          });
          session.pauseResolver = null;
          if (!session.interruptFlag) {
            sendJSON(ws, { type: 'resumed' });
          }
        }

        // Check for interrupt after emit_segment or conversational_reply
        if ((block.name === 'emit_segment' || block.name === 'conversational_reply') && session.interruptFlag) {
          const interruptData = session.interruptFlag;
          session.interruptFlag = null;
          interrupted = true;

          for (const remaining of response.content) {
            if (remaining.type !== 'tool_use') continue;
            if (toolResults.some((r) => r.tool_use_id === remaining.id)) continue;
            toolResults.push({
              type: 'tool_result',
              tool_use_id: remaining.id,
              content: JSON.stringify({ skipped: true, reason: 'learner interrupt' }),
            });
          }

          toolResults.push({
            type: 'text',
            text: `[LEARNER INTERRUPT] The learner has a question: "${interruptData.question}". Please use respond_to_interrupt to answer their question, then continue from where you left off.`,
          });

          messages.push({ role: 'user', content: [...toolResults] });
          break;
        }
      }

      if (!interrupted && toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults });
      }

      // After processing tools, drain guided message queue
      if (!interrupted && session.guidedMessageQueue && session.guidedMessageQueue.length > 0) {
        const queuedMessages = session.guidedMessageQueue.splice(0);
        for (const msg of queuedMessages) {
          // Client already added the message to its transcript when it sent it,
          // so do NOT send add_student_message back (that would duplicate it).
          messages.push({
            role: 'user',
            content: `[STUDENT MESSAGE] ${msg}`,
          });
        }
      }
    }
  }
}
