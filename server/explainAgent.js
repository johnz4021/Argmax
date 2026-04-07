// Explain mode agent — direct solution walkthrough with visualization, no Socratic dialogue

import { tools } from './tools.js';
import { ALGORITHMS, runRegisteredAlgorithm } from './algorithms/registry.js';
import { handleToolCall, sendJSON, sendBinary, liveWs, getClient } from './agentLib.js';
import { synthesizeAndStream, resetTTSDisabled } from './tts.js';
import { buildRendererDocs } from './rendererManifest.js';
import { solveProblem, solveProblems } from './solver.js';
import { buildExampleGraph } from './graphBuilder.js';
import { adviseRenderer } from './rendererAdvisor.js';
import { getModeDefaultPanels } from './contextPanelDefaults.js';

function buildAlgorithmList() {
  return Object.entries(ALGORITHMS)
    .map(([id, info]) => `- ${id} (${info.category}, renderer: ${info.renderer})`)
    .join('\n');
}

const MAX_API_CALLS_PER_SESSION = 80;

const EXPLAIN_SYSTEM_PROMPT = `You are Argmax, an expert algorithm tutor. The student submitted a problem and wants a clear, direct explanation with visualization. Do NOT use the Socratic method — just explain directly and thoroughly.

SCOPE CONSTRAINT:
- You ONLY help with algorithm and data structures problems from the list below.
- If the user's input is clearly not an algorithm/data structures problem, respond: "This doesn't look like an algorithm or data structures problem. I can only help with those topics — try rephrasing or pasting a different problem!"
- Do NOT act as a general-purpose assistant, code writer, essay helper, or chatbot.

AVAILABLE ALGORITHMS (this is your HARD BOUNDARY):
${buildAlgorithmList()}

REQUEST TYPE DETECTION:
First, determine if the student's input is:
A) A CONCEPT REQUEST — asking how an algorithm works, what a data structure is,
   or requesting a general explanation (e.g., "Explain BFS", "How does Dijkstra's work",
   "What is dynamic programming?", "Teach me about max flow")
B) A CONCRETE PROBLEM — a homework problem with specific input data, constraints,
   or questions to answer (e.g., "Run Dijkstra on this graph: A-B:4...",
   "Find the MST of...", "Write an LP for...")

If (A) CONCEPT REQUEST: Follow the CONCEPT FLOW below.
If (B) CONCRETE PROBLEM: Follow the PROBLEM FLOW below.

CONCEPT FLOW (for concept/general explanation requests):
1. Acknowledge what the student wants to learn (1 segment via emit_segment).
2. Identify the closest algorithm from the AVAILABLE ALGORITHMS list.
3. Construct a small, clear example input yourself:
   - For graph algorithms: create a graph with 5-7 nodes and meaningful weights/capacities.
   - For sorting/searching: use a small array (6-10 elements).
   - For DP: use a small instance (e.g., small knapsack, short strings for LCS).
   - Make the example pedagogically useful — it should exercise the algorithm's
     key behaviors (not a trivial case).
4. Set up the visualization (create_graph or create_visualization).
5. Call run_algorithm with the constructed input.
6. Narrate each step using emit_segment with trace_step_indices, explaining
   WHY each step happens, not just WHAT happens.
7. Summarize the key ideas, time complexity, and when to use this algorithm.
8. Call lesson_complete.

Do NOT call run_solver or run_solver_batch for concept requests — there is no problem to solve.
Do NOT use send_options — there are no sub-problems to select.

PROBLEM FLOW (for concrete problems):

STEP 0 — SUB-PROBLEM SELECTION (if multi-part problem):
  Read the full problem. If it contains multiple sub-problems or parts (e.g., "(a)...(b)...(c)..."),
  use send_options with multiSelect: true to let the student select which parts to explain.
  List each part as an option (e.g., id: "a", label: "Part (a): ...").
  This is the ONLY time you should use send_options — never use it for questions or quizzes.
  Once the student selects:
  - If they selected MULTIPLE parts: call run_solver_batch with all selected sub-problems.
  - If they selected a SINGLE part: call run_solver with the extracted sub-problem text.
  If the problem is a single question (no parts), call run_solver with the full problem text.
  IMPORTANT: Always call run_solver or run_solver_batch BEFORE starting the explanation.
  You need the solver's verified answer to explain correctly.

STEP 1 — Acknowledge the problem briefly (1 segment via emit_segment).
STEP 2 — Identify the problem type: algorithm execution, modeling, greedy design, DP design, D&C, or runtime analysis.
STEP 3 — Set up the visualization (create_graph or create_visualization with context_panels).
STEP 4 — Follow the appropriate mode below.
STEP 5 — Summarize the result and key takeaways (1-2 segments).
STEP 6 — Call lesson_complete when done. If multiple parts were selected, explain each part
  sequentially before calling lesson_complete.

PROBLEM TYPE MODES:

ALGORITHM EXECUTION MODE:
  For problems that require running a specific algorithm on given input.
  1. Set up the graph/visualization via create_graph or create_visualization (call build_example_graph first)
  2. Call run_algorithm to get the trace (auto-configures context panels)
  3. Build input visually BEFORE running the algorithm
  4. Narrate each step using emit_segment with trace_step_indices
  5. Verify against expected output if provided in the problem

MODELING MODE (LP, reductions, duality):
  After run_solver, a Formulation panel is auto-configured with placeholder lines
  (Variables, Objective, Constraints). Call advise_renderer for a viz recommendation.
  Use emit_segment with viz_actions (renderer:"context", action:"update") to fill the panel.
  For "write an LP," "define variables," "take a dual," or "reduce X to Y":
  1. OBJECTS — Define the decision variables and explain why
  2. OBJECTIVE — State and explain what is being optimized
     Use emit_segment viz_actions to update the formulation panel (add objective line)
     and highlight relevant graph edges.
  3. CONSTRAINTS — Walk through each constraint, highlighting the graph structures
     that correspond to each one
  4. TRICK — Explain any transformation needed (absolute value linearization, layering, etc.)
  5. SANITY CHECK — Verify the formulation captures the problem

  Each panel update must include ALL accumulated lines (the array is replaced, not appended).
  When building an auxiliary/product/layered graph as part of a reduction,
  ALWAYS render it using update_graph. Students need to SEE the construction.
  Do NOT call run_algorithm unless the problem explicitly asks for execution.

GREEDY DESIGN MODE:
  After run_solver, Greedy Rule and Proof Skeleton panels are auto-configured.
  Call advise_renderer for a viz recommendation.
  Use emit_segment with viz_actions (renderer:"context", action:"update") to fill them.
  1. RULE — Explain the greedy criterion and why it works
  2. EXAMPLE — Set up a concrete example and trace through the greedy behavior
  3. ALGORITHM — Present the full algorithm
  4. PROOF — Walk through the exchange argument / proof of correctness
  5. RUNTIME — Analyze time complexity
  Do NOT call run_algorithm unless the problem explicitly asks for execution.

DP DESIGN MODE:
  After run_solver, DP Definition and Recurrence panels are auto-configured.
  Call advise_renderer for a viz recommendation.
  Use emit_segment with viz_actions (renderer:"context", action:"update") to fill them.
  1. SUBPROBLEM — Define what dp[i] (or dp[i][j]) represents and why
  2. RECURRENCE — Derive the recurrence relation step by step. Update the Recurrence panel.
  3. BASE CASES — State the boundary conditions
  4. ORDER — Explain the fill order
  5. RUNTIME — Analyze based on table size and per-cell work
  Optionally run the algorithm on a small example if one exists in the registry.
  Do NOT call run_algorithm unless the problem explicitly asks for execution.

DIVIDE-AND-CONQUER MODE:
  After run_solver, D&C Structure and Recurrence context panels are auto-configured.
  No visualization renderer is pre-created. Call advise_renderer for a viz recommendation.
  Follow its renderer choice, timing, and stage plan. If the planner fails, choose yourself:
  - RECURRENCE TREE: If the problem has a clean T(n) = aT(n/b) + O(n^d) recurrence,
    call create_visualization with panels:[{renderer:"recursion_tree"}]. Then use
    set_recurrence_tree({a, b, d, n: 16}) via viz_actions to populate it.
    Never show an empty recursion tree — populate it in the same emit_segment.
  - DECISION/CASE TREE: If case analysis or branching is the key insight,
    call create_visualization with panels:[{renderer:"graph"}]. Use update_graph to
    build a top-down decision tree (nodes=states, edges labeled via weight field).
  - NO VIZ: If purely structural/proof-based, skip visualization.
  1. SPLIT — How to divide the input
  2. SUBPROBLEMS — What recursive calls are made
  3. COMBINE — How to merge subproblem results
  4. RECURRENCE — Write T(n) = aT(n/b) + O(n^d) and solve it:
     a. Use set_recurrence_tree({a, b, d, n: 16}) to build the tree visualization
     b. Walk through levels with reveal_level and highlight_level
     c. Use show_master_case to reveal which MT case applies
     d. Use set_cumulative to show the total work

RUNTIME / ASYMPTOTICS MODE:
  After run_solver, a Runtime Analysis context panel is auto-configured (no renderer yet).
  Use emit_segment viz_actions (renderer:"context", action:"update") to fill the panel.
  1. Identify what bound is needed (upper, lower, tight)
  2. For recurrences: identify which method (Master theorem, substitution, recursion tree)
  3. If using recursion tree / Master Theorem:
     Call create_visualization with panels:[{renderer:"recursion_tree"}] AND in the
     SAME emit_segment include set_recurrence_tree({a, b, d, n: 16}) via viz_actions.
     Never create an empty recursion tree.
     a. Walk through levels with reveal_level and highlight_level
     b. Use show_master_case to show which levels dominate
     c. Use set_cumulative to show the total work sum
  4. Walk through the proof steps using the expression panel
  5. Use concrete values to build intuition

SEGMENT BUDGET:
- Introduction: 1-2 segments
- Modeling template: 2-3 segments per step (objects, objective, constraints, trick, sanity)
- Greedy/DP/DC design: 2-3 segments per step
- Algorithm execution: 10-20 segments (standard walkthrough)
- Summary: 1-2 segments

OUTPUT RULES:
- NEVER respond with plain text. ALWAYS use the emit_segment tool for ALL narration.
- Explain DIRECTLY — no questions, no MCQs, no "what do you think?" prompts
- Keep explanations clear and educational but move at a steady pace
- Use respond_to_interrupt if the student asks a question mid-explanation.
  Pick the right explanation_mode:
  - "overlay" — dims the ENTIRE graph to 15% opacity, then spotlights only the
    nodes/edges you specify at full brightness. Use for ANY question answerable
    by highlighting a subset of the current graph: "why this node?", "show me
    the min-cut", "which nodes are reachable?", "show me in the residual graph",
    partition questions (s-side vs t-side), etc. Provide the "overlay" object
    with spotlight_nodes (array of node IDs), spotlight_edges (array of
    {from, to}), and annotations (array of {target, text, position}) to label
    spotlit elements. You can ALSO pass top-level viz_actions alongside overlay
    mode — both are applied (e.g. show_residual_overlay + overlay spotlight).
  - "rewind" — replays recent teaching steps more slowly with new narration.
    Use for "what just happened?", "I'm lost", "can you repeat that?" questions.
    Provide the "rewind" object with steps_back (1-5, how many segments to go
    back) and narration_per_step (array of strings — re-explain each replayed
    step using simpler/different wording than the original).
  - "ghost_alternative" — shows an alternative path as a translucent ghost
    overlay alongside the actual chosen path, for direct visual comparison.
    Use for "what if we picked X instead?", "why not go through Y?" questions.
    Provide the "ghost_alternative" object with ghost_path (node IDs of the
    alternative), actual_path (node IDs of the real choice), ghost_label
    (e.g. "cost: 7"), and actual_label (e.g. "cost: 4").
  - "illustrate" — for conceptual "why does X work?" questions where the current graph
    CANNOT show the concept. Provide the "illustrate" property with "graph" (nodes, edges,
    optional directed). The "answer" field should be a SHORT intro (1 sentence) spoken
    before the example graph appears. Do NOT include "steps".

    After respond_to_interrupt returns, you are on the example graph. Teach step-by-step
    using emit_segment with manual viz_actions (NOT trace_step_indices — there is no
    trace on the example graph). Use 2-6 emit_segment calls to walk through the concept.

    When done, call end_illustration to restore the original lesson graph and continue.
  - "none" — simple factual questions with no visual needs
- RESIDUAL GRAPH TOGGLE (max-flow only): The student has a "Show/Hide Residual
  Graph" button. You can also toggle it with viz_actions:
  [{action: "toggle_residual", show: true}] to switch to residual view, or
  show: false to switch back. Use this when teaching about residual graphs —
  toggle ON, narrate, then toggle OFF. Cleaner than overlaying both at once.
- MATH NOTATION: Use LaTeX notation wrapped in $...$ for all mathematical expressions,
  both in narration text (emit_segment) and in panel lines (text fields).
  Examples: $f_{uv}$, $\\sum_{e} c_e \\cdot f_e$, $d_{\\text{flow}}(s,t)$, $\\leq$, $\\geq$.
  Do NOT use plain Unicode symbols like Σ — use $\\Sigma$ or $\\sum$ instead.
  This applies to panel labels, panel line text, and narration strings.

CRITICAL — VISUALIZATION ACTIONS ARE MANDATORY:
Once a visualization is active (after create_graph or create_visualization), EVERY emit_segment
that references a node, edge, path, cut, cell, or any visual element MUST include viz_actions
to highlight those elements. The student is watching the visualization — narration without
corresponding highlights is confusing and defeats the purpose.
- NEVER narrate "let's look at node X" or "consider edge (u,v)" without a viz_action.

TWO VISUALIZATION MODES:

MODE A — Algorithm execution (trace available):
  1. Call run_algorithm to get the trace (auto-configures context panels)
  2. Use emit_segment with trace_step_indices — the system auto-generates viz_actions
  Example:
    emit_segment({ narration: "Now we visit node B with distance 4...", trace_step_indices: [3], phase: "Visiting B" })

MODE B — Proof/theory/modeling (NO trace, manual viz_actions required):
  When explaining proofs, LP formulations, cuts, or any concept where run_algorithm is not used,
  you MUST construct viz_actions manually.
  Examples:
    // Highlighting a cut in a max-flow proof
    emit_segment({
      narration: "Consider the cut separating {s} from {A, B, t}...",
      viz_actions: [
        { renderer: "graph", action: "highlight_node", params: { node: "s", className: "current" } },
        { renderer: "graph", action: "highlight_edge", params: { from: "s", to: "A", className: "highlighted" } },
        { renderer: "graph", action: "highlight_edge", params: { from: "s", to: "B", className: "highlighted" } }
      ],
      phase: "Cut Analysis"
    })
    // Showing a path
    emit_segment({
      narration: "The shortest path from s to t goes through B...",
      viz_actions: [
        { renderer: "graph", action: "show_path", params: { path: ["s", "B", "t"] } }
      ],
      phase: "Path Analysis"
    })
    // Updating a context panel (formulation, DP definition, etc.)
    emit_segment({
      narration: "Now let's add the objective to our LP formulation...",
      viz_actions: [
        { renderer: "context", action: "update", params: {
          panel_id: "formulation",
          label: "$\\\\text{LP: Flow Distance}$",
          lines: [
            { label: "Variables", text: "$f_{uv}$ for each directed edge $(u,v)$" },
            { label: "$\\\\min$", text: "$\\\\sum_e c_e \\\\cdot f_e$", highlight: true }
          ]
        }}
      ]
    })

TOOL USAGE FOR NON-EXECUTION MODES:

A. Context panels are AUTO-CONFIGURED after run_solver. You do NOT need to call
  create_visualization for them — panels are already set up with placeholder content.
  You CAN still call create_visualization manually if you need to add a renderer panel
  (e.g. graph or interval) on top of the auto-configured context panels.

B. Updating panels incrementally as you explain:
  Use emit_segment with a context viz_action.
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

C. Adding a renderer panel in non-execution mode:
  A renderer panel is NOT auto-created — create one via create_visualization if the
  problem benefits from a visual (graph, interval timeline, recursion tree, etc.).
  PANEL ID RULE: Always use the renderer type as the panel id:
    create_visualization({ panels: [{ id: "interval", renderer: "interval" }] })
    NOT { id: "intervals", renderer: "interval" }  ← wrong, causes routing mismatch
  In viz_actions, the renderer field must exactly match the panel id you assigned.

  Available renderers and actions:
  - graph: highlight_node, highlight_edge, mark_visited, mark_current, set_label, reset_highlights, show_path, update_edge_label
  - array: set_data, highlight, swap, compare, partition, place, mark_sorted, set_pointer, clear_pointers, slide_window, set_label, reset
  - table: init_grid, fill_cell, highlight_cell, highlight_row, highlight_col, show_dependency_arrow, clear_dependency_arrows, set_row_header, set_col_header, mark_optimal, reset
  - tree: set_tree, highlight_node, highlight_edge, insert_node, delete_node, rotate_left, rotate_right, recolor_node, sift_up, sift_down, mark_level, update_heap_array, reset
  - linked: set_list, highlight_node, highlight_pointer, insert_after, delete_node, reverse_segment, push, pop, enqueue, dequeue, set_pointer, reset
  - interval: set_jobs, set_machines, assign_machine, highlight_job, highlight_jobs, highlight_overlap, clear_overlaps, mark_sorted, mark_selected, mark_rejected, sweep_line, clear_sweep_line, set_pointer, clear_pointers, reset
    USE interval FOR: job scheduling, minimum machines, interval overlap, activity selection, conference scheduling — any problem with jobs/intervals on a timeline.

  Call get_renderer_docs to get full parameter docs, classNames, and examples for any renderer(s) you need.

CONTEXT PANEL IDs (for reference — these are auto-created, use these ids in viz_actions):
  MODELING:          formulation
  GREEDY DESIGN:     greedy_rule, proof_skeleton
  DP DESIGN:         dp_definition, recurrence
  DIVIDE-AND-CONQUER: dc_structure, recurrence
  RUNTIME:           runtime_analysis

GRAPH RENDERER DETAILED REFERENCE:
${buildRendererDocs(['graph'])}

GUARDRAILS:
- Never make up an algorithm trace. Always use run_algorithm.
- Build input visually BEFORE running the algorithm (create_graph or create_visualization first).
- In non-execution modes (modeling, greedy_design, dp_design, dc_design, runtime),
  do NOT call run_algorithm unless the problem explicitly asks for execution.
- Use formal model panels (expression panels with lines mode) to keep structured
  information visible: variables, objective, constraints, recurrences, invariants.
- In non-execution modes, context panels are auto-configured after run_solver.
  Use emit_segment viz_actions to fill them — do NOT call create_visualization for the context panels.
- Each formulation/recurrence panel update must include ALL accumulated lines (array is replaced, not appended).
- When building an auxiliary/product/layered graph as part of a reduction,
  ALWAYS render it using update_graph. Students need to SEE the construction.
  If the product graph is too large (>12 nodes), render a representative subset.
- INPUT SIZE LIMITS: Max 12 nodes / 20 edges for graphs, max 15 elements for arrays, max 8x8 for DP tables.
  If the problem exceeds these, build a smaller example for visualization.

VISUALIZATION SETUP:
- Use create_graph for graph algorithms and graph-based proofs
- Use create_visualization for non-graph problems (arrays, DP tables, trees, interval)
- For graph algorithms with a trace, prefer trace_step_indices over manual viz_actions

VISUALIZATION PLANNING (problem flow only):
After run_solver, the correct planner depends on the mode returned:

- algorithm_execution → call build_example_graph
  Returns: panels (pre-built graphs), algorithm_runs, graph_variants, teaching_notes
  Workflow: create_visualization with panels → run_algorithm for each run → narrate with trace_step_indices

- modeling / greedy_design / dp_design / dc_design / runtime → call advise_renderer
  Returns: renderer recommendation, create_at_stage, viz_stages, recurrence_params (for D&C)
  Context panels are ALREADY auto-configured after run_solver — do NOT call create_visualization for them.
  Follow the stage plan returned by advise_renderer for when/whether to add a renderer.

NEVER call build_example_graph for non-execution modes — it is not designed for them.
NEVER call advise_renderer for algorithm_execution mode — use build_example_graph instead.

GRAPH VARIANTS (transformation problems):
When build_example_graph returns graph_variants, the planner has pre-built transformed
graphs. Do NOT construct these graphs manually. Instead:
- Narrate the transformation conceptually first ("Now we transform G into G' where...")
- Call create_graph with variant_id to swap the visualization
- Run the variant's algorithm_runs
- Continue narrating on the new graph

If build_example_graph fails, fall back to constructing the visualization manually.

MULTI-GRAPH COMPARISON (when the planner returns multiple graph panels):
- Each panel has a unique ID (e.g., "graph_left", "graph_right")
- Target viz_actions by panel ID: { renderer: "graph_left", action: "highlight_node", ... }
- Use run_algorithm with graph_id to run on a specific panel's graph
- Use emit_segment with graph_id to reference the correct trace for trace_step_indices
- Narrate across panels: "On the left, notice... now on the right..."

ENDING THE EXPLANATION:
- When the full explanation is complete, call the lesson_complete tool.
- Do NOT stop responding without calling lesson_complete.

POST-LESSON FOLLOW-UP MODE:
- After the explanation completes, the student may ask follow-up questions.
- These arrive prefixed with [FOLLOW-UP QUESTION].
- Answer concisely (1-3 sentences via emit_segment). Reference the lesson context.
- Do NOT restart the explanation flow.`;

// Tools for explain mode — subset of guided tools (no conversational_reply during explanation)
// send_options is kept for sub-problem selection only
const explainTools = [
  ...tools.filter(t => t.name !== 'conversational_reply'),
  {
    name: 'get_renderer_docs',
    description: 'Get full documentation (params, classNames, examples) for one or more visualization renderers. Call this before constructing viz_actions for a renderer you haven\'t used yet.',
    input_schema: {
      type: 'object',
      properties: {
        renderers: {
          type: 'array',
          items: { type: 'string', enum: ['graph', 'array', 'table', 'tree', 'linked', 'interval', 'recursion_tree'] },
          description: 'Which renderer(s) to get docs for',
        },
      },
      required: ['renderers'],
    },
  },
  {
    name: 'lesson_complete',
    description: 'Signal that the explanation is finished. Call this after you have fully explained the solution with visualization.',
    input_schema: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Brief summary of what was covered',
        },
      },
      required: ['summary'],
    },
  },
  {
    name: 'run_solver',
    description: 'Run the problem solver to get a verified solution before explaining. Call this BEFORE starting the explanation. Pass the focused sub-problem text.',
    input_schema: {
      type: 'object',
      properties: {
        subproblem_text: {
          type: 'string',
          description: 'The text of the specific sub-problem to solve. Include enough context for the solver to understand the problem standalone.',
        },
      },
      required: ['subproblem_text'],
    },
  },
  {
    name: 'run_solver_batch',
    description: 'Run the problem solver on MULTIPLE sub-problems in a single call. Use when the student selects multiple parts.',
    input_schema: {
      type: 'object',
      properties: {
        subproblems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              part_label: {
                type: 'string',
                description: 'Label for this part (e.g., "a", "b", "1").',
              },
              subproblem_text: {
                type: 'string',
                description: 'The text of this sub-problem, including shared context.',
              },
            },
            required: ['part_label', 'subproblem_text'],
          },
          description: 'Array of sub-problems to solve.',
        },
      },
      required: ['subproblems'],
    },
  },
  {
    name: 'build_example_graph',
    description: 'Plan the visualization layout for an algorithm_execution problem. Call AFTER run_solver to get a pre-built visualization setup (graphs, panels, algorithm runs). IMPORTANT: For algorithm_execution mode ONLY — never use this for non-execution modes (greedy, dp, modeling, d&c, runtime). Use advise_renderer for those.',
    input_schema: {
      type: 'object',
      properties: {
        problem_text: {
          type: 'string',
          description: 'The problem text being explained',
        },
      },
      required: ['problem_text'],
    },
  },
  {
    name: 'advise_renderer',
    description: 'Plan visualization for NON-EXECUTION modes only (D&C, DP, greedy, modeling, runtime). NEVER call this for algorithm_execution mode — use build_example_graph instead. Call AFTER run_solver completes. Returns renderer recommendation and stage-by-stage viz plan.',
    input_schema: {
      type: 'object',
      properties: {
        problem_text: {
          type: 'string',
          description: 'The problem text being worked on',
        },
      },
      required: ['problem_text'],
    },
  },
];

function buildSolverContext(result) {
  let ctx = `

===== SOLVER CONTEXT (use this to guide your explanation) =====
APPROACH: ${result.approach}
COMPLEXITY: ${result.complexity}
KEY INSIGHT: ${result.keyInsight}
SOLUTION: ${result.solution}
=====`;
  return ctx;
}

function applyClassification(plan, session, ws, vizState) {
  session.reasoningMode = plan.reasoning_mode;

  if (plan.reasoning_mode === 'algorithm_execution') {
    return {
      success: true,
      message: `Mode: algorithm_execution. Target: ${plan.target_algorithm || 'N/A'}. Now call build_example_graph to plan the visualization.`,
    };
  }

  const targetAlgo = plan.target_algorithm || plan.closest_algorithm;
  const algoInfo = targetAlgo ? ALGORITHMS[targetAlgo] : null;
  let rendererType = algoInfo?.renderer || 'graph';
  const algoLower = (targetAlgo || '').toLowerCase();
  if (algoLower.includes('interval') || algoLower.includes('schedule') || algoLower.includes('machine') || algoLower.includes('job') || algoLower.includes('activity')) {
    rendererType = 'interval';
  }

  const rendererDocs = buildRendererDocs([rendererType]);
  const modeDefaults = getModeDefaultPanels(plan.reasoning_mode);

  let message = `Mode: ${plan.reasoning_mode}. Now call advise_renderer to plan the visualization.`;
  if (modeDefaults) {
    const autoRenderer = modeDefaults.renderer === null ? null : (modeDefaults.renderer || rendererType);
    const panels = autoRenderer ? [{ renderer: autoRenderer, config: {} }] : [];
    sendJSON(ws, { type: 'create_visualization', panels, context_panels: modeDefaults.context_panels });
    if (autoRenderer && vizState) {
      vizState.vizActive = true;
      vizState.segmentsWithoutVizActions = 0;
    }
    const panelIds = modeDefaults.context_panels.map(p => p.id);
    message += autoRenderer
      ? ` Context panels [${panelIds.join(', ')}] and renderer "${autoRenderer}" are auto-configured. Do NOT call create_visualization. Fill panels via emit_segment viz_actions.`
      : ` Context panels [${panelIds.join(', ')}] are auto-configured. No renderer pre-created — call create_visualization if a visualization adds value.`;
  }
  message += `\n\nRENDERER REFERENCE (${rendererType}):\n${rendererDocs}`;

  return { success: true, message };
}

export async function startExplainSession(session, problemText, imageBase64, imageMimeType) {
  resetTTSDisabled();
  session.currentGraph = null;
  session.currentTrace = null;
  session.currentRenderer = null;
  session.currentAlgorithm = null;
  session.mapperState = {};
  session.graphs = {};
  session.traces = {};
  session.mapperStates = {};
  session._emittedTraceSteps = [];
  session._savedGraphState = null;

  const ws = liveWs(session);

  // Reuse guided_start message type — client treats it identically but with mode hint
  sendJSON(ws, { type: 'guided_start', problemText, mode: 'explain' });

  session.imageBase64 = imageBase64 || null;
  session.imageMimeType = imageMimeType || null;

  // Build initial user message
  const userContent = [];
  if (imageBase64 && imageMimeType) {
    userContent.push({
      type: 'image',
      source: { type: 'base64', media_type: imageMimeType, data: imageBase64 },
    });
  }
  const textPart = problemText
    ? `Here is the problem to explain:\n\n${problemText}`
    : 'See the attached image for the problem to explain.';
  userContent.push({
    type: 'text',
    text: `${textPart}\n\nFirst, determine if this is a concept/general explanation request or a concrete problem with specific input. If it's a concept request, follow the CONCEPT FLOW — construct your own example and explain directly. If it's a concrete problem, check for multiple parts (use send_options if needed), call run_solver or run_solver_batch to get the verified solution, then explain with a visual walkthrough.`,
  });

  const messages = [{ role: 'user', content: userContent }];
  await runExplainLoop(session, messages, EXPLAIN_SYSTEM_PROMPT);
}

async function runExplainLoop(session, messages, initialSystemPrompt) {
  const ws = liveWs(session);
  const myGeneration = session.runGeneration;
  let emptyEndTurnCount = 0;
  const vizState = { vizActive: false, segmentsWithoutVizActions: 0 };
  let vizActive = vizState.vizActive;
  let segmentsWithoutVizActions = vizState.segmentsWithoutVizActions;
  let systemPrompt = initialSystemPrompt;
  let solverResult = null;
  let solverResultsMap = {};
  let activePart = null;
  let selectedParts = [];

  let apiCallCount = 0;
  let continueLoop = true;
  while (continueLoop) {
    let lessonDone = false;
    if (session.ws.readyState !== 1) {
      if (!session.wsDisconnectedAt || Date.now() - session.wsDisconnectedAt > 60000) break;
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    if (session.endSessionFlag || session.runGeneration !== myGeneration) throw new Error('__end_session__');

    if (apiCallCount >= MAX_API_CALLS_PER_SESSION) {
      sendJSON(ws, { type: 'error', message: 'Session limit reached. Please start a new session.' });
      break;
    }

    sendJSON(ws, { type: 'agent_status', status: 'thinking' });

    let response;
    try {
      apiCallCount++;
      response = await getClient(session).messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        tools: explainTools,
        messages,
      });
    } catch (err) {
      console.error('[ExplainAgent] API error:', err.message);
      const status = err?.status;
      if (status === 429) {
        sendJSON(ws, { type: 'error', message: 'Rate limited. Please wait a moment and try again.' });
      } else if (status === 401 || status === 403) {
        sendJSON(ws, { type: 'credits_exhausted' });
      } else {
        sendJSON(ws, { type: 'error', message: 'API request failed. Please try again.' });
      }
      break;
    }

    if (session.endSessionFlag || session.runGeneration !== myGeneration) throw new Error('__end_session__');
    console.log('[ExplainAgent] Response stop_reason:', response.stop_reason, 'content types:', response.content.map(b => b.type));

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      const textBlocks = response.content.filter(b => b.type === 'text' && b.text?.trim());
      if (textBlocks.length > 0) {
        emptyEndTurnCount = 0;
        const narrationText = textBlocks.map(b => b.text).join('\n');
        sendJSON(ws, {
          type: 'segment_start',
          segment_id: 'explain_text_' + Date.now(),
          narration: narrationText,
          phase: 'Explaining...',
          viz_actions: [],
        });
        messages.push({
          role: 'user',
          content: 'You responded with plain text instead of using tools. You MUST use emit_segment for all narration. When a visualization is active, include viz_actions to highlight the elements you reference (nodes, edges, paths, cuts). Never respond with plain text.',
        });
        continue;
      }

      // Check for queued student messages (interrupts routed as messages)
      if (session.guidedMessageQueue && session.guidedMessageQueue.length > 0) {
        const queuedMessages = session.guidedMessageQueue.splice(0);
        for (const msg of queuedMessages) {
          messages.push({
            role: 'user',
            content: `[STUDENT QUESTION] ${msg}`,
          });
        }
        continue;
      }

      emptyEndTurnCount++;
      if (emptyEndTurnCount >= 3) {
        console.log('[ExplainAgent] Safety valve: 3 consecutive empty end_turns, forcing lesson_complete');
        sendJSON(ws, { type: 'lesson_complete' });
        lessonDone = true;
      } else {
        messages.push({
          role: 'user',
          content: 'You returned an empty response. Continue explaining using emit_segment with viz_actions to highlight relevant elements. If the explanation is finished, call lesson_complete.',
        });
        continue;
      }
    }

    if (response.stop_reason === 'tool_use') {
      emptyEndTurnCount = 0;
      const toolResults = [];
      let interrupted = false;

      const TOOL_LABELS = {
        create_visualization: 'Creating visualization',
        emit_segment: null,
        run_algorithm: 'Running algorithm',
        update_graph: 'Building graph',
        get_renderer_docs: null,
        lesson_complete: 'Wrapping up',
        send_options: null,
        run_solver: 'Solving problem',
        run_solver_batch: 'Solving problems',
        build_example_graph: 'Planning visualization',
      };

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        const toolLabel = TOOL_LABELS[block.name];
        if (toolLabel) {
          sendJSON(ws, { type: 'agent_status', status: 'tool', tool: toolLabel });
        }

        let result;

        if (block.name === 'send_options') {
          // Sub-problem selection — send choices and wait for response
          const { prompt } = block.input;
          sendJSON(ws, { type: 'guided_options', prompt, options: block.input.options || [], mode: block.input.mode || 'mc', input_placeholder: block.input.input_placeholder, multiSelect: block.input.multiSelect || false });

          const responsePromise = new Promise((resolve) => {
            if (session.guidedResponse) { resolve(); return; }
            if (session.pendingGuidedResponses?.length > 0) {
              session.guidedResponse = session.pendingGuidedResponses.shift();
              resolve();
              return;
            }
            if (session.guidedMessageQueue?.length > 0) {
              const queued = session.guidedMessageQueue.shift();
              session.guidedResponse = { text: queued, timestamp: Date.now() };
              resolve();
              return;
            }
            session.guidedResponseResolver = resolve;
          });
          const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => resolve('__timeout__'), 600000);
          });

          // TTS for the prompt
          const sendBinaryFn = (buffer) => sendBinary(ws, buffer);
          const sendJsonFn = (obj) => sendJSON(ws, obj);
          const ttsResult = await synthesizeAndStream(sendBinaryFn, prompt, session.speedMultiplier, sendJsonFn, () => session.pauseFlag || session.skipFlag, session.ttsMuted);
          if (ttsResult?.ttsAutoDisabled && !session._ttsDisabledNotified) {
            session._ttsDisabledNotified = true;
            sendJSON(ws, { type: 'tts_auto_disabled' });
          }

          if (ttsResult?.aborted || session.pauseFlag || session.skipFlag) {
            sendJSON(ws, { type: 'audio_flush' });

            if (session.skipFlag) {
              session.skipFlag = false;
              session.pauseFlag = false;
              if (session.endSessionFlag) throw new Error('__end_session__');
              // Sub-problem selection is unskippable — just stop TTS, still wait for selection
            } else {
              session.pauseFlag = false;
              if (session.endSessionFlag) throw new Error('__end_session__');
              sendJSON(ws, { type: 'paused' });
              await new Promise((resolve) => { session.pauseResolver = resolve; });
              session.pauseResolver = null;
              if (session.endSessionFlag) throw new Error('__end_session__');
              if (!session.interruptFlag) sendJSON(ws, { type: 'resumed' });
            }
          }

          sendJSON(ws, { type: 'guided_prompt', prompt });
          const raceResult = await Promise.race([responsePromise, timeoutPromise]);
          session.guidedResponseResolver = null;

          if (raceResult === '__end_session__' || session.endSessionFlag) {
            throw new Error('__end_session__');
          } else if (raceResult === '__timeout__') {
            sendJSON(ws, { type: 'clear_guided_options' });
            result = { student_response: null, timed_out: true, message: 'Student did not respond. Explain all parts.' };
          } else if (raceResult === '__interrupted__') {
            sendJSON(ws, { type: 'clear_guided_options' });
            result = { student_response: null, interrupted: true, message: 'Student interrupted. The interrupt will be handled next.' };
          } else {
            const studentResponse = session.guidedResponse;
            session.guidedResponse = null;
            sendJSON(ws, { type: 'clear_guided_options' });
            const answerText = studentResponse?.text || studentResponse?.labels?.join(', ') || studentResponse?.optionId || '';
            result = {
              student_response: studentResponse,
              timed_out: false,
              selected_option_id: studentResponse?.optionId || null,
              selected_option_ids: studentResponse?.optionIds || null,
              selected_labels: studentResponse?.labels || null,
              freeform_text: studentResponse?.text || null,
              message: `The student selected: "${answerText}". Now call run_solver or run_solver_batch for the selected parts, then explain them.`,
            };
          }
        } else if (block.name === 'run_solver') {
          // Synchronous solve — wait for result before continuing
          const statusCb = (label) => sendJSON(ws, { type: 'agent_status', status: 'tool', tool: label });
          const sr = await solveProblem(
            block.input.subproblem_text,
            statusCb,
            session.imageBase64,
            session.imageMimeType,
            session.anthropicClient,
          );
          if (session.endSessionFlag) throw new Error('__end_session__');
          if (sr.success) {
            solverResult = sr;
            systemPrompt = EXPLAIN_SYSTEM_PROMPT + buildSolverContext(sr);
            console.log(`[ExplainAgent] Solver succeeded: approach="${sr.approach}", mode="${sr.reasoning_mode}"`);
            if (sr.reasoning_mode) {
              const classResult = applyClassification(sr, session, ws, vizState);
              vizActive = vizState.vizActive;
              segmentsWithoutVizActions = vizState.segmentsWithoutVizActions;
              result = {
                success: true,
                reasoning_mode: sr.reasoning_mode,
                target_algorithm: sr.target_algorithm || null,
                key_insight: sr.keyInsight,
                message: classResult.message,
              };
            } else {
              result = {
                success: true,
                message: `Solver complete. Approach: ${sr.approach}. Key insight: ${sr.keyInsight}. Now explain the solution directly.`,
              };
            }
          } else {
            result = { success: false, message: 'Solver failed. Proceed with your own analysis.' };
          }
        } else if (block.name === 'run_solver_batch') {
          const statusCb = (label) => sendJSON(ws, { type: 'agent_status', status: 'tool', tool: label });
          const subproblems = block.input.subproblems.map((sp) => ({
            part_label: sp.part_label,
            text: sp.subproblem_text,
          }));
          selectedParts = subproblems.map((sp) => sp.part_label);
          activePart = selectedParts[0];

          const batchResult = await solveProblems(
            subproblems,
            statusCb,
            session.imageBase64,
            session.imageMimeType,
            session.anthropicClient,
          );
          if (session.endSessionFlag) throw new Error('__end_session__');
          if (batchResult.success) {
            solverResultsMap = batchResult.solutions;
            solverResult = solverResultsMap[activePart];
            systemPrompt = EXPLAIN_SYSTEM_PROMPT + buildSolverContext(solverResult);
            console.log(`[ExplainAgent] Batch solver succeeded, active part: ${activePart}, mode="${solverResult?.reasoning_mode}"`);
          }
          let classMessage = '';
          if (batchResult.success && solverResult?.reasoning_mode) {
            const classResult = applyClassification(solverResult, session, ws, vizState);
            vizActive = vizState.vizActive;
            segmentsWithoutVizActions = vizState.segmentsWithoutVizActions;
            classMessage = ' ' + classResult.message;
          }
          result = {
            success: batchResult.success,
            active_part: activePart,
            selected_parts: selectedParts,
            message: batchResult.success
              ? `All parts solved. Starting with Part ${activePart}.${classMessage}`
              : 'Batch solver failed. Proceed with your own analysis.',
          };
        } else if (block.name === 'build_example_graph') {
          const statusCb = (label) => sendJSON(ws, { type: 'agent_status', status: 'tool', tool: label });
          const plan = await buildExampleGraph(
            block.input.problem_text,
            solverResult,
            statusCb,
            session.imageBase64,
            session.imageMimeType,
            session.anthropicClient,
          );
          if (session.endSessionFlag) throw new Error('__end_session__');
          if (plan.success) {
            // Pre-store graphs on session
            for (const panel of plan.panels) {
              if (panel.renderer === 'graph' && panel.graph) {
                if (!session.graphs) session.graphs = {};
                session.graphs[panel.id] = panel.graph;
              }
            }
            // Store graph variants on session
            if (plan.graph_variants) {
              session.graphVariants = plan.graph_variants;
            }
          }
          result = {
            success: plan.success,
            panels: plan.panels,
            algorithm_runs: plan.algorithm_runs,
            context_panels: plan.context_panels,
            teaching_notes: plan.teaching_notes,
            graph_variants: plan.graph_variants ? Object.keys(plan.graph_variants).map(k => ({
              id: k,
              title: plan.graph_variants[k].title,
              algorithm_runs: plan.graph_variants[k].algorithm_runs,
            })) : [],
            message: plan.success
              ? `Visualization planned: ${plan.panels.length} panel(s). ${plan.graph_variants ? Object.keys(plan.graph_variants).length + ' graph variant(s) available.' : ''} ${plan.teaching_notes || ''} Now call create_visualization with these panels, then run_algorithm for each planned run. To swap graphs mid-lesson, call create_graph with variant_id.`
              : 'Viz planning failed. Construct visualization manually.',
          };
        } else if (block.name === 'advise_renderer') {
          if (!solverResult?.success) {
            result = {
              success: false,
              message: 'Solver has not completed yet. Skip visualization planning and use your judgment — create visualization manually when you know what fits the problem.',
            };
          } else {
            const statusCb = (label) => sendJSON(ws, { type: 'agent_status', status: 'tool', tool: label });
            const dvPlan = await adviseRenderer(
              block.input.problem_text,
              solverResult,
              session.reasoningMode,
              statusCb,
              session.imageBase64,
              session.imageMimeType,
              session.anthropicClient,
            );
            if (session.endSessionFlag) throw new Error('__end_session__');
            if (dvPlan.success) {
              let dvMsg = `Viz plan: renderer=${dvPlan.renderer || 'none'}, create_at=${dvPlan.create_at_stage}. ${dvPlan.reasoning}`;
              if (dvPlan.recurrence_params) {
                const { a, b, d } = dvPlan.recurrence_params;
                dvMsg += `\nRecurrence pre-computed: a=${a}, b=${b}, d=${d}. When you reach the recurrence stage, call create_visualization with panels:[{renderer:"recursion_tree"}], then immediately emit set_recurrence_tree({a:${a}, b:${b}, d:${d}, n:16}) via viz_actions.`;
              }
              if (dvPlan.renderer && dvPlan.create_at_stage === 'immediately') {
                dvMsg += `\nCall create_visualization now with panels:[{renderer:"${dvPlan.renderer}"}].`;
              } else if (dvPlan.renderer && dvPlan.create_at_stage !== 'never') {
                dvMsg += `\nDo NOT create visualization yet — wait until the "${dvPlan.create_at_stage}" stage, then call create_visualization with panels:[{renderer:"${dvPlan.renderer}"}].`;
              }
              if (dvPlan.viz_stages?.length > 0) {
                dvMsg += '\nStage plan:';
                for (const s of dvPlan.viz_stages) {
                  dvMsg += `\n  - ${s.stage}: ${s.description}`;
                }
              }
              result = {
                success: true,
                renderer: dvPlan.renderer,
                create_at_stage: dvPlan.create_at_stage,
                viz_stages: dvPlan.viz_stages || [],
                recurrence_params: dvPlan.recurrence_params,
                extra_context_panels: dvPlan.extra_context_panels || [],
                message: dvMsg,
              };
            } else {
              result = {
                success: false,
                message: 'Design viz planning failed. Use your judgment — see mode-specific instructions for visualization choices. Default to no visualization rather than an empty one.',
              };
            }
          }
        } else if (block.name === 'get_renderer_docs') {
          result = { docs: buildRendererDocs(block.input.renderers) };
        } else if (block.name === 'lesson_complete') {
          // Check for remaining batch parts
          if (selectedParts.length > 1 && activePart) {
            solverResultsMap[activePart]._completed = true;
            const remainingParts = selectedParts.filter((p) => !solverResultsMap[p]?._completed);
            if (remainingParts.length > 0) {
              const nextPart = remainingParts[0];
              activePart = nextPart;
              solverResult = solverResultsMap[nextPart];
              if (solverResult) {
                systemPrompt = EXPLAIN_SYSTEM_PROMPT + buildSolverContext(solverResult);
              }
              result = {
                success: true,
                all_parts_done: false,
                completed_part: block.input?.summary ? activePart : activePart,
                next_part: nextPart,
                remaining_parts: remainingParts,
                message: `Part done. ${remainingParts.length} part(s) remaining: ${remainingParts.join(', ')}. Now explain Part ${nextPart}. Approach: ${solverResult?.approach || 'N/A'}. Key insight: ${solverResult?.keyInsight || 'N/A'}.`,
              };
            } else {
              sendJSON(ws, { type: 'lesson_complete' });
              lessonDone = true;
              result = { success: true, all_parts_done: true, message: 'All parts explained. Explanation complete.' };
            }
          } else {
            sendJSON(ws, { type: 'lesson_complete' });
            lessonDone = true;
            result = { success: true, message: 'Explanation complete.' };
          }
        } else {
          // Delegate to shared handler (emit_segment, create_graph, create_visualization, run_algorithm, update_graph, respond_to_interrupt)
          result = await handleToolCall(session, block, null, null, null);
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });

        // Track viz state
        if (block.name === 'create_visualization' || block.name === 'create_graph' || block.name === 'update_graph') {
          vizActive = true;
          segmentsWithoutVizActions = 0;
        }
        if (block.name === 'emit_segment') {
          const hasVizActions = block.input?.viz_actions?.length > 0 || block.input?.trace_step_indices?.length > 0;
          if (hasVizActions) {
            segmentsWithoutVizActions = 0;
          } else {
            segmentsWithoutVizActions++;
          }
        }

        // Check for interrupt after emit_segment
        if (block.name === 'emit_segment' && session.interruptFlag) {
          const interruptData = session.interruptFlag;
          session.interruptFlag = null;
          interrupted = true;

          // Snapshot current graph state so we can restore after the interrupt
          // (in case the agent constructs a temporary example graph via illustrate mode)
          if (!session._savedGraphState) {
            session._savedGraphState = {
              graph: session.currentGraph,
              trace: session.currentTrace,
              algorithm: session.currentAlgorithm,
              renderer: session.currentRenderer,
              mapperState: { ...session.mapperState },
              emittedTraceSteps: [...(session._emittedTraceSteps || [])],
            };
          }

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
            text: `[LEARNER INTERRUPT] The learner has a question: "${interruptData.question}". Please use respond_to_interrupt to answer their question, then continue explaining from where you left off.`,
          });

          messages.push({ role: 'user', content: [...toolResults] });
          break;
        }
      }

      // Inject viz reminder if needed (aggressive — 2 segments without viz)
      if (!interrupted && vizActive && segmentsWithoutVizActions >= 2) {
        toolResults.push({
          type: 'text',
          text: '[VIZ REMINDER] You have an active visualization but recent segments had no viz_actions. The student is watching the graph — you MUST include viz_actions in emit_segment to highlight the nodes, edges, paths, or cuts you are discussing. Use { renderer: "graph", action: "highlight_node", params: { node: "X", className: "current" } } or { renderer: "graph", action: "highlight_edge", params: { from: "X", to: "Y", className: "highlighted" } } or { renderer: "graph", action: "show_path", params: { path: ["A", "B", "C"] } }.',
        });
        segmentsWithoutVizActions = 0;
      }

      if (!interrupted && toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults });
      }

      // Drain queued student messages
      if (!interrupted && session.guidedMessageQueue && session.guidedMessageQueue.length > 0) {
        const queuedMessages = session.guidedMessageQueue.splice(0);
        for (const msg of queuedMessages) {
          messages.push({
            role: 'user',
            content: `[STUDENT QUESTION] ${msg}`,
          });
        }
      }
    }

    // After lesson_complete, enter follow-up mode
    if (lessonDone) {
      session.followUpSent = true;
      const followUpMsg = await new Promise((resolve) => {
        session.followUpResolver = resolve;
        const timer = setTimeout(() => resolve('__timeout__'), 5 * 60 * 1000);
        session._followUpTimer = timer;
      });
      if (session._followUpTimer) {
        clearTimeout(session._followUpTimer);
        session._followUpTimer = null;
      }
      session.followUpResolver = null;

      if (followUpMsg === '__end_session__' || session.endSessionFlag) {
        throw new Error('__end_session__');
      }
      if (followUpMsg === '__timeout__' || (session.ws.readyState !== 1 && (!session.wsDisconnectedAt || Date.now() - session.wsDisconnectedAt > 60000))) {
        continueLoop = false;
        break;
      }

      // Inject follow-up question and continue
      messages.push({
        role: 'user',
        content: `[FOLLOW-UP QUESTION] ${followUpMsg}`,
      });
      continue;
    }
  }
}
