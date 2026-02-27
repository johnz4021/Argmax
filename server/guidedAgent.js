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

THREE CONVERSATIONAL STAGES (flow naturally between them, no rigid transitions):

1. CLASSIFY (2-4 exchanges):
   - Read the problem. Think about which algorithm applies.
   - Use send_options to ask the student classification questions following the tree above.
     Example flow: "What's the core structure?" → "Graph" → "What are you looking for?" → "Shortest path" → "Weighted?" → "Yes" → dijkstra
   - After classification, call classify_problem with your analysis.
   - The internal_model_contract stays in YOUR REASONING ONLY — it is NOT shown to students.
   - If the student picks wrong, give a nudge and re-ask (max 2 attempts before revealing).

2. REFRESH (optional):
   - After classification, offer: "Want a quick refresher on [algorithm]?" via send_options.
   - If yes, call show_canonical_example to run a small built-in example.
   - Keep refresher brief: 5-8 segments max.

3. REDUCTION SKETCH:
   - Guide the student to describe the algorithm input in their own words.
   - Ask them: "What are the nodes? What are the edges? What are the weights?"
     (or "What are the items? What's the capacity?" for knapsack, etc.)
   - Build the graph/input incrementally using update_graph (for graph algorithms)
     or create_visualization (for non-graph algorithms).
   - When the input is complete, run the algorithm, narrate the trace, then verify.

HANDLING STUDENT MESSAGES:
- Messages tagged [STUDENT MESSAGE] are first-class conversation continuations.
- The student may answer in free text instead of clicking options — incorporate naturally.
- When a student answers a send_options question, you'll get the result in the tool response.
- If the student gives a wrong answer, provide a conceptual nudge (not the answer) and try again.

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
- If the problem requires a proof → offer concrete examples that illustrate the theorem.
- If the problem is about linear programming → identify the underlying algorithm (e.g., max flow).
- If the problem involves number theory → try GCD or explain the closest available algorithm.
- If the problem mentions NP-completeness → show both the decision and optimization versions.
- If the problem is completely out of scope, say so honestly and suggest the closest algorithm.

GUARDRAILS:
- Never make up an algorithm trace. Always use run_algorithm.
- Keep classification phase concise — 2-4 questions max.
- Model Contract stays internal — never display it to students.
- Use emit_segment for all narration (same as standard teaching mode).
- Build input visually BEFORE running the algorithm.

CONFIDENCE CALIBRATION:
- Single well-known reduction → narrate confidently.
- Multi-step reduction → justify each step.
- Revised model → teach the revision: "I initially thought X, but that misses Y."
- Unverified assumptions → use hedged language.

SEGMENT BUDGETING:
- Classification: 2-4 segments + 1-2 send_options calls
- Refresher: 5-8 segments (if requested)
- Reduction sketch: 2-4 segments showing the transformation
- Execution: 10-20 segments (standard teaching)
- Verification: 1-2 segments`;

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
      required: ['is_in_scope', 'target_algorithm', 'problem_summary', 'key_insight', 'internal_model_contract'],
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

export async function startGuidedSession(session, problemText) {
  const { ws } = session;

  sendJSON(ws, { type: 'guided_start', problemText });

  const messages = [
    {
      role: 'user',
      content: `Here is the problem the student wants to solve:\n\n${problemText}\n\nBegin by reading the problem carefully. Start a conversation with the student to classify which algorithm applies — use send_options with the classification tree. Do NOT call classify_problem until you've had 2-3 exchanges with the student.`,
    },
  ];

  let sessionPlan = null;

  let continueLoop = true;
  while (continueLoop) {
    if (ws.readyState !== ws.OPEN) break;

    let response;
    try {
      response = await anthropic.messages.create({
        model: 'claude-opus-4-6',
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

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        let result;

        if (block.name === 'classify_problem') {
          const plan = block.input;
          sessionPlan = plan;
          session.modelContract = plan.internal_model_contract;

          const validAlgorithms = Object.keys(ALGORITHMS);
          if (plan.is_in_scope && !validAlgorithms.includes(plan.target_algorithm)) {
            result = {
              success: false,
              error: `Unknown algorithm: ${plan.target_algorithm}. Available: ${validAlgorithms.join(', ')}`,
            };
          } else {
            result = {
              success: true,
              message: plan.is_in_scope
                ? `Classification accepted. Target: ${plan.target_algorithm}. Internal model contract stored (NOT shown to student). Now offer a refresher via send_options, then proceed to the reduction sketch. If the problem has sample I/O, remember to call verify_result at the end.`
                : `Problem is out of scope. Closest algorithm: ${plan.closest_algorithm}. Guide the student with the closest available algorithm.`,
            };
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
            setTimeout(() => resolve('__timeout__'), 120000);
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

        // Check for pause after emit_segment
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

        // Check for interrupt after emit_segment
        if (block.name === 'emit_segment' && session.interruptFlag) {
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
          // Add student message to transcript
          sendJSON(ws, { type: 'add_student_message', text: msg });
          messages.push({
            role: 'user',
            content: `[STUDENT MESSAGE] ${msg}`,
          });
        }
      }
    }
  }
}
