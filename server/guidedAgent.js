// Guided problem-solving agent — Socratic hint sequence before algorithm execution

import Anthropic from '@anthropic-ai/sdk';
import { tools } from './tools.js';
import { ALGORITHMS } from './algorithms/registry.js';
import { handleToolCall, sendJSON, sendBinary } from './agent.js';
import { synthesizeAndStream } from './tts.js';

const anthropic = new Anthropic({ maxRetries: 5 });

// Build algorithm list dynamically from registry
function buildAlgorithmList() {
  return Object.entries(ALGORITHMS)
    .map(([id, info]) => `- ${id} (${info.category}, renderer: ${info.renderer})`)
    .join('\n');
}

const GUIDED_SYSTEM_PROMPT = `You are Argmax, an expert algorithm tutor. A student has pasted a problem they need help with.

YOUR ROLE: Guide them to the solution through progressive hints. Do NOT solve the problem for them immediately. Make them think.

AVAILABLE ALGORITHMS (this is your HARD BOUNDARY):
${buildAlgorithmList()}

PHASE STRUCTURE:
1. ANALYZE: Read the problem. Determine which algorithm applies. If it doesn't map to any
   available algorithm, say so honestly — suggest the closest one for partial exploration.
   Call \`plan_guided_session\` with your analysis.

1.5. MODEL CONTRACT & SELF-CHECK:
   After planning the session, you MUST produce a Model Contract. This is non-negotiable.
   Fill out ALL of these fields honestly in plan_guided_session:
   - State definition: what must be tracked?
   - Transition rules: what moves are legal?
   - Cost model: what determines cost? Is it local to each edge or does it depend on
     carried state (e.g., which battery you're holding)?
   - Feasibility constraints: what makes a move illegal?
   - Assumptions: list every simplifying assumption your reduction makes.

   Then SELF-CHECK: For each assumption, try to construct a small counterexample (4-5 nodes)
   where the assumption fails. If you find one, REVISE your reduction before proceeding.
   Do not present a reduction you cannot defend.

   Common modeling traps to watch for:
   - "Cost depends on source vertex" vs "cost depends on current carried state"
   - "Constraint applies per-edge" vs "constraint spans multiple edges"
   - "Greedy swap at every vertex" vs "optimal to skip intermediate swaps"
   - "Standard edge weights" vs "weights require precomputation (e.g., all-pairs distances)"
   - "Can use ANY resource at a location" vs "can only use the SPECIFIC resource available there"
   - "Resources are universally available" vs "resources are location-bound"

   RESOURCE/ACTION SPECIFICITY CHECK (do this for EVERY action in your transition rules):
   For every action you allow (swap, pick up, drop, buy, equip, etc.), ask:
   - Can this action be performed with ANY item/resource, or only a SPECIFIC one at this location?
   - Re-read the problem statement literally. Does it say "grab a new battery FROM one of
     the charging stations" (location-bound) or "choose any battery" (universal)?
   - If resources are location-bound, your expanded graph must ONLY have swap/pickup edges
     to the resource that actually exists at that vertex. Do NOT add edges for resources
     that are not physically present at that location.
   - Example: if vertex 3 has battery B3, then at vertex 3 you can only swap TO B3. You
     cannot magically pick up B1 or B2 at vertex 3.

   If your self-check reveals the reduction is wrong or uncertain, say so explicitly.
   Present the corrected model, or if you can't find one, tell the student: "The full
   reduction for this problem is subtle — here's what I'm confident about, and here's
   where the modeling gets tricky." Partial honesty beats confident wrongness.

2. IDENTIFY: Ask the student what type of problem this is. Give 3-4 options (one correct,
   others plausible). Use \`send_options\` to present choices. If they get it wrong, give a
   conceptual nudge via \`emit_segment\`, then re-ask. Maximum 2 attempts before revealing.

3. MODEL: Walk the student through the key insight — how to transform the problem into a
   standard algorithm input. This is the MOST IMPORTANT phase. For example:
   - "The edge weights aren't given directly — you need to compute time = distance / speed"
   - "Each item has a weight and value — we need to extract those from the problem statement"
   Show the transformation step by step using emit_segment.

   CRITICAL: During this phase, you MUST call create_graph (for graph algorithms) or
   create_visualization (for non-graph algorithms) to SHOW the constructed input visually.
   The student should SEE the graph/array/table being built as you explain the modeling.
   For graph algorithms, call create_graph with the nodes, edges, and positions you've
   derived from the problem. Do this BEFORE calling run_algorithm. The left panel should
   never be empty while you're describing the data structure.

4. EXECUTE: Run the algorithm on the constructed input. Teach it using the standard
   Argmax approach (trace_step_indices, narration, context panels). Follow ALL the teaching
   guidelines from the standard teaching mode — vary pacing, narrate insight not description,
   use landmark/routine/summary classification.

5. VERIFY: Check the answer against any sample output from the original problem. Connect
   back to the original problem statement. Summarize what the student learned.

   HARD RULE: If the problem provides sample input/output, and your computed answer does
   NOT match the expected sample output, your reduction is WRONG. Do not rationalize the
   discrepancy. Do not claim your algorithm "found a better solution" — the problem-setter's
   sample output is ground truth. Instead:
   1. Stop and tell the student: "Our answer doesn't match the expected output. That means
      my model has a bug. Let me go back and find it."
   2. Re-examine the Model Contract. Which assumption was wrong?
   3. Identify the specific error (e.g., wrong swap edges, wrong cost formula, missing
      constraint).
   4. Explain the error to the student as a teaching moment: "I assumed X, but the problem
      actually says Y. This is a common modeling trap."
   5. If you can fix the reduction, rebuild the graph and re-run. If you can't, be honest.

   A mismatch with sample output is ALWAYS evidence of a modeling error, never evidence
   that your model is superior to the problem-setter's answer.

GUARDRAILS:
- If the problem requires an algorithm you don't have, be transparent: "This problem uses
  [X] which I can't visualize yet. But I can help you think through the approach, and
  show you [closest available algorithm] on a simplified version."
- If the problem is purely theoretical (prove X, write an LP), acknowledge that you can't
  prove theorems, but offer to build concrete examples that illustrate why the theorem holds.
- If the problem text doesn't seem to involve algorithms/data structures at all, say so:
  "This doesn't look like an algorithm problem. Argmax is designed for algorithm visualization
  — try pasting a problem that involves graphs, sorting, dynamic programming, or similar topics."
- Never make up an algorithm trace. Always use run_algorithm.
- Keep hint phases concise — 2-4 questions maximum before moving to modeling.
- INPUT SIZE LIMITS for visualization: max 12 nodes/20 edges for graphs, 15 elements for
  arrays, 8x8 for DP tables. If the problem's input exceeds these, build a smaller example
  for interactive visualization, then verify on the full input conceptually.

CONFIDENCE CALIBRATION:
- If the reduction is a single well-known transformation (e.g., "run Dijkstra on the
  given graph with weight = edge_weight"), narrate confidently.
- If the reduction involves multiple steps (e.g., "compute all-pairs shortest distances,
  then build a derived graph, then run Dijkstra on that"), explicitly walk through WHY
  each step is valid. Say "this is a multi-step reduction, so let me justify each piece."
- If you revised your model during self-check, tell the student: "I initially thought X,
  but that misses Y constraint. Here's the corrected approach." This is a teaching moment,
  not a failure.
- When assumptions are unverified (e.g., the self-check was inconclusive), use hedged
  language: "I believe this is correct, but the [specific assumption] is worth double-
  checking against edge cases."

WORKFLOW:
1. First, call plan_guided_session with your analysis
2. Use emit_segment for narration (same as standard teaching mode)
3. Use send_options when you want to ask the student a multiple-choice question
4. During the MODEL phase, call create_graph (for graph algorithms) or create_visualization
   (for array/table/tree/linked algorithms) to display the constructed input BEFORE running
   the algorithm. The student must see the data structure you built from the problem.
5. When ready to execute, call run_algorithm (this will use the graph/viz you already created)
6. Narrate the algorithm using emit_segment with trace_step_indices
7. End with verification and summary

HANDLING STUDENT RESPONSES:
- When a student selects an option, you'll receive it as the tool result from send_options
- If the student types freeform text instead (delivered as an interrupt), incorporate their
  input naturally — they may be answering your question in their own words
- If the student selects the wrong option, give a conceptual nudge (not the answer) and
  try once more. After 2 wrong attempts, reveal the answer gently and move on.

SEGMENT BUDGETING:
- Analysis/Identification phase: 2-4 segments + 1-2 send_options calls
- Modeling phase: 2-4 segments showing the transformation
- Execution phase: 10-20 segments (same as standard teaching)
- Verification: 1-2 segments`;

// New tools specific to guided mode
const guidedTools = [
  ...tools,
  {
    name: 'plan_guided_session',
    description:
      'Called once after analyzing the student\'s problem. Produces a structured plan for the guided session including which algorithm to use, the key insight, and a hint plan.',
    input_schema: {
      type: 'object',
      properties: {
        is_in_scope: {
          type: 'boolean',
          description: 'Whether the problem maps to an available algorithm',
        },
        target_algorithm: {
          type: 'string',
          description: 'Algorithm ID from registry (e.g., "dijkstra", "knapsack"), or "out_of_scope"',
        },
        closest_algorithm: {
          type: 'string',
          description: 'If out of scope, the closest available algorithm for partial exploration',
        },
        problem_summary: {
          type: 'string',
          description: 'One-sentence summary of what the problem is asking',
        },
        key_insight: {
          type: 'string',
          description: 'The main modeling insight the student needs to discover',
        },
        constructed_input: {
          type: 'object',
          description: 'The algorithm input to construct (graph, array, items, etc.)',
        },
        hint_plan: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              options: { type: 'array', items: { type: 'string' } },
              correct_option: { type: 'string' },
              nudge_if_wrong: { type: 'string' },
            },
            required: ['question', 'options', 'correct_option', 'nudge_if_wrong'],
          },
          description: 'Sequence of hint questions to guide the student',
        },
        model_contract: {
          type: 'object',
          properties: {
            state_definition: {
              type: 'string',
              description: 'What information must be tracked to make optimal decisions? E.g. \'(current_node, battery_origin)\' or \'(current_node, remaining_capacity)\'',
            },
            transition_rules: {
              type: 'string',
              description: 'What actions are allowed and with what specificity? E.g. \'At vertex i, can swap ONLY to battery_i (the one physically at that station). Drive along edge (u,v) using currently held battery if capacity allows.\' Be precise about whether resources are location-bound or universal.',
            },
            cost_model: {
              type: 'string',
              description: 'What determines cost and how does it accumulate? Is cost local to each edge or state-dependent? E.g. \'Time = distance / speed of CURRENT battery (not source vertex). Accumulated additively along path.\'',
            },
            feasibility_constraints: {
              type: 'string',
              description: 'What makes a move illegal? E.g. \'Total distance driven on one battery cannot exceed its capacity c_i. Must reach vertex N.\'',
            },
            assumptions_to_verify: {
              type: 'array',
              items: { type: 'string' },
              description: 'Explicit list of assumptions the reduction makes that could be wrong. MUST include assumptions about resource availability (e.g. \'Any battery can be picked up at any vertex\' vs \'Only vertex i\'s battery is available at vertex i\') and action scope (\'swap happens at every vertex\' vs \'swap is optional\').',
            },
          },
          required: ['state_definition', 'transition_rules', 'cost_model', 'feasibility_constraints', 'assumptions_to_verify'],
        },
      },
      required: ['is_in_scope', 'target_algorithm', 'problem_summary', 'key_insight', 'hint_plan', 'model_contract'],
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
    // Check DP table dimensions based on algorithm
    if (algorithm === 'knapsack' && input?.items?.length > 8) {
      warnings.push(`${input.items.length} items would create a large DP table (max 8 for visualization).`);
    }
    if ((algorithm === 'lcs' || algorithm === 'edit_distance') && (input?.str1?.length > 8 || input?.str2?.length > 8)) {
      warnings.push(`String lengths exceed 8 characters, creating a large DP table. Consider using shorter strings.`);
    }
  }
  return warnings;
}

export async function startGuidedSession(session, problemText) {
  const { ws } = session;

  sendJSON(ws, { type: 'guided_start', problemText });

  const messages = [
    {
      role: 'user',
      content: `Here is the problem the student wants to solve:\n\n${problemText}\n\nAnalyze this problem and call plan_guided_session with your analysis. Then guide the student through understanding and solving it.`,
    },
  ];

  let sessionPlan = null; // Store the plan from plan_guided_session

  let continueLoop = true;
  while (continueLoop) {
    if (ws.readyState !== ws.OPEN) break;

    let response;
    try {
      response = await anthropic.messages.create({
        model: !sessionPlan
          ? 'claude-opus-4-6'              // First turn: analysis + model contract
          : 'claude-sonnet-4-5-20250929',  // Everything after: teaching
        max_tokens: 4096,
        system: GUIDED_SYSTEM_PROMPT,
        tools: guidedTools,
        messages,
      });
    } catch (err) {
      console.error('[GuidedAgent] API error:', err.message);
      sendJSON(ws, { type: 'error', message: 'API request failed. Please try again.' });
      break;
    }

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      continueLoop = false;
      sendJSON(ws, { type: 'lesson_complete' });
      break;
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults = [];
      let interrupted = false;

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        let result;

        if (block.name === 'plan_guided_session') {
          // Handle plan_guided_session tool
          const plan = block.input;
          sessionPlan = plan;

          // Validate target algorithm
          const validAlgorithms = Object.keys(ALGORITHMS);
          if (plan.is_in_scope && !validAlgorithms.includes(plan.target_algorithm)) {
            result = {
              success: false,
              error: `Unknown algorithm: ${plan.target_algorithm}. Available: ${validAlgorithms.join(', ')}`,
            };
          } else {
            // Validate input size if constructed_input is provided
            const sizeWarnings = plan.constructed_input
              ? validateInputSize(plan.constructed_input, plan.target_algorithm)
              : [];

            sendJSON(ws, { type: 'guided_phase', phase: 'identifying' });

            // Display Model Contract as context panels
            if (plan.model_contract) {
              const contract = plan.model_contract;
              sendJSON(ws, {
                type: 'create_visualization',
                panels: [],
                context_panels: [
                  {
                    id: 'model_contract',
                    type: 'key_value',
                    title: 'Model Contract',
                    initial_data: {
                      layout: 'table',
                      entries: [
                        { key: 'State', value: contract.state_definition, status: 'default' },
                        { key: 'Transitions', value: contract.transition_rules, status: 'default' },
                        { key: 'Cost model', value: contract.cost_model, status: 'default' },
                        { key: 'Constraints', value: contract.feasibility_constraints, status: 'default' },
                      ],
                    },
                  },
                  {
                    id: 'assumptions',
                    type: 'log',
                    title: 'Assumptions to Verify',
                    initial_data: {
                      entries: (contract.assumptions_to_verify || []).map((a) => ({
                        text: a,
                        type: 'decision',
                      })),
                    },
                  },
                ],
              });
            }

            result = {
              success: true,
              message: plan.is_in_scope
                ? `Plan accepted. Target algorithm: ${plan.target_algorithm}. The Model Contract and Assumptions panels are now visible to the student. Narrate the contract — walk through each field and ask the student if they agree before proceeding to hints. IMPORTANT: If the problem includes sample input/output, you MUST verify your final answer against it. A mismatch means your reduction is wrong — do not rationalize it.`
                : `Problem is out of scope. Closest algorithm: ${plan.closest_algorithm}. The Model Contract is displayed. Guide the student accordingly.`,
              size_warnings: sizeWarnings.length > 0 ? sizeWarnings : undefined,
            };
          }
        } else if (block.name === 'send_options') {
          // Handle send_options tool — send choices and wait for response
          const { prompt, options } = block.input;

          sendJSON(ws, { type: 'guided_options', prompt, options });

          // TTS for the prompt
          const sendBinaryFn = (buffer) => sendBinary(ws, buffer);
          const sendJsonFn = (obj) => sendJSON(ws, obj);
          await synthesizeAndStream(sendBinaryFn, prompt, session.speedMultiplier, sendJsonFn);

          // Wait for student response with 2-minute timeout
          const responsePromise = new Promise((resolve) => {
            session.guidedResponseResolver = resolve;
          });
          const timeoutPromise = new Promise((resolve) => {
            setTimeout(() => resolve('__timeout__'), 120000);
          });

          const raceResult = await Promise.race([responsePromise, timeoutPromise]);

          session.guidedResponseResolver = null;

          if (raceResult === '__timeout__') {
            // Student didn't respond in time
            sendJSON(ws, { type: 'clear_guided_options' });
            result = {
              student_response: null,
              timed_out: true,
              message: 'Student did not respond within 2 minutes. Give them a hint and reveal the answer.',
            };
          } else {
            // Student responded
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
        } else if (block.name === 'run_algorithm') {
          // Send transition message before running algorithm
          sendJSON(ws, { type: 'guided_transition' });
          sendJSON(ws, { type: 'guided_phase', phase: 'executing' });
          result = await handleToolCall(session, block, null, sessionPlan?.target_algorithm, null);
        } else {
          // Delegate all other tools (emit_segment, create_graph, etc.) to shared handler
          result = await handleToolCall(session, block, null, sessionPlan?.target_algorithm, null);
        }

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });

        // Check for pause after emit_segment (same as agent.js)
        if (block.name === 'emit_segment' && session.pauseFlag) {
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

        // Check for interrupt after emit_segment (same as agent.js)
        if (block.name === 'emit_segment' && session.interruptFlag) {
          const interruptData = session.interruptFlag;
          session.interruptFlag = null;
          interrupted = true;

          // Add remaining tool results for unprocessed blocks
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
    }
  }
}