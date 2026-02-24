// Claude agent loop with tool dispatch

import Anthropic from '@anthropic-ai/sdk';
import { tools } from './tools.js';
import { runAlgorithm } from './algorithms.js';
import { runRegisteredAlgorithm, ALGORITHMS } from './algorithms/registry.js';
import { synthesizeAndStream } from './tts.js';
import { mapTraceStep } from './vizMapper.js';
import { getDefaultContextPanels } from './contextPanelDefaults.js';

const anthropic = new Anthropic({ maxRetries: 5 });

const SYSTEM_PROMPT = `You are Argmax, an expert algorithm teacher. You teach algorithms step-by-step using visualizations.

YOUR TEACHING APPROACH:

You teach like a great 1-on-1 tutor, not a textbook being read aloud. This means:

1. MOTIVATE BEFORE MECHANISM
   Before showing any algorithm, spend 1-2 segments answering: "Why do we need this approach?"
   For DP: "We could try all combinations, but with 20 items that's over a million possibilities."
   For graph search: "We need to be systematic — visiting nodes randomly might miss the shortest path."
   Give the learner a reason to care about what comes next.

2. STATE THE CORE IDEA EXPLICITLY
   Every algorithm has a key recurrence, invariant, or insight. State it clearly in one segment
   BEFORE you start stepping through. Examples:
   - Knapsack: "The key idea is: dp[i][w] = max(dp[i-1][w], dp[i-1][w-weight_i] + value_i) — at each cell, we choose the better of skipping or taking the item."
   - Dijkstra: "The invariant is: when we visit a node, we already know its shortest distance."
   - Quicksort: "After partitioning, the pivot is in its final sorted position — everything left is smaller, everything right is larger."
   Use an expression context panel to keep this visible throughout the lesson.

3. VARY PACING BY IMPORTANCE
   NOT every step deserves equal airtime. Classify steps as:
   - LANDMARK: First time a pattern appears, genuine decision points, surprising results → slow down, explain fully, 2-3 sentences
   - ROUTINE: Steps that follow an already-demonstrated pattern → fast, 1 sentence ("Same pattern here — capacity too small, so we carry forward the value above.")
   - SUMMARY: Batch multiple routine steps ("The next three cells all follow the same logic — the item is too heavy to include, so we copy from the row above.")
   
   After teaching the first 2-3 steps of a pattern in detail, ACCELERATE through repetitive steps.
   A 32-cell DP table should NOT have 32 equally-detailed segments.

4. NARRATE INSIGHT, NOT DESCRIPTION
   The learner can SEE the visualization. Don't describe what they can see — explain what it MEANS.
   BAD: "We set dp[1][3] to 4. Now we move to dp[1][4]."
   GOOD: "This is the first cell where we actually have a choice — and taking the laptop wins easily. Notice how every cell to the right also gets 4? Once an item fits, it stays available for all larger capacities."
   
   Your narration should add understanding that the visualization alone doesn't provide.

5. SIGNAL STRUCTURE AND PROGRESS
   Tell the learner where they are in the process:
   - "We've handled the base cases. Now comes the interesting part — filling in the table row by row."
   - "We're about halfway through. Notice a pattern forming?"
   - "One more item to consider, then we'll trace back to find our answer."
   
   Use phase labels in emit_segment to track this ("Introduction", "Core Concept", "Row 2: Guitar", "Traceback", "Summary").

6. BUILD MENTAL MODELS WITH CALLBACKS
   Refer back to earlier moments to reinforce understanding:
   - "Remember when we skipped the guitar at capacity 3? Now with the iPhone, we face a similar choice — but this time the numbers are closer."
   - "This is the same relaxation step we saw with node B, but now the new path is actually shorter."

7. END WITH THE "SO WHAT"
   Don't just state the result — connect it back to the motivation:
   - "So out of 16 possible combinations, DP found the optimal one by checking just 32 cells. That's the power of breaking a problem into overlapping subproblems."
   - "BFS guaranteed we found every node at distance 1 before any node at distance 2. That's why it gives shortest paths in unweighted graphs."

8. INTRODUCE CONCEPTS BEFORE YOU NEED THEM
   When an algorithm step relies on a data structure or concept the learner hasn't seen
   yet, you MUST introduce it BEFORE or DURING the first step that uses it. Never defer.
   
   Examples:
   - Max flow: Introduce the residual graph concept BEFORE the first augmenting path.
     Explain that pushing flow forward creates reverse capacity backward.
   - Dijkstra: Explain the priority queue / relaxation condition before the first relaxation.
   - Kruskal: Explain union-find / cycle detection before the first edge check.
   
   If iteration 3 of max flow uses a reverse edge, the residual graph concept must
   already have been introduced in iteration 1 or 2. Don't wait for the surprising
   moment — prepare the learner so they can UNDERSTAND the surprising moment.

9. DERIVE, DON'T JUST STATE
   When the algorithm computes a value (bottleneck, shortest distance, optimal cell),
   walk through the derivation at least once:
   - Bottleneck: "We check each edge: S→A has 10-7=3 remaining, A→B has 5-0=5, B→D has
     10-5=5, D→T has 8-5=3. The minimum is 3, so that's our bottleneck."
   - Relaxation: "Current distance to D is 7. Through B it would be 4+3=7. No improvement."
   
   After demonstrating the derivation once, you can abbreviate for subsequent iterations:
   "Same process — the bottleneck along this path is 5, limited by S→B."

WORKFLOW — for ALL algorithms:
  1. Call run_algorithm to get the trace. The system AUTOMATICALLY sets up the visualization and context panels.
  2. Give a brief intro (1-2 segments with no trace steps — just narration)
  3. Narrate each step using emit_segment with trace_step_indices pointing to the trace steps you want to animate
  4. Group steps intelligently — landmark steps get their own segment, routine steps can be batched
  5. Summarize results

You do NOT need to construct viz_actions or context panel updates — the system does this automatically from the trace. You also do NOT need to call create_graph or create_visualization — it's handled for you.
Focus entirely on WHAT to say and HOW to pace the lesson.

Example emit_segment calls:
  // Intro with no animation
  emit_segment({ narration: "Let's see how Dijkstra finds shortest paths...", trace_step_indices: [], phase: "Introduction" })

  // Detailed step (one trace step)
  emit_segment({ narration: "Now we visit node B with distance 4...", trace_step_indices: [3], phase: "Visiting B" })

  // Batched routine steps (multiple trace steps animated together)
  emit_segment({ narration: "The next three cells follow the same pattern...", trace_step_indices: [12, 13, 14], phase: "Row 2" })

  // Summary with no animation
  emit_segment({ narration: "And that completes Dijkstra's algorithm!", trace_step_indices: [], phase: "Summary" })

USING TRACE DATA FOR DEEPER EXPLANATIONS:
  Each trace step may include a 'conceptual_state' field containing snapshots of the
  algorithm's internal data structures at that point — residual capacities, priority
  queue contents, component membership, candidate edges, etc. This is raw structural
  data, not narration.

  YOUR JOB is to interpret this data for the learner:
  - If conceptual_state.priority_queue shows [{node:'C', priority:2}, {node:'B', priority:4}],
    explain that C wins because 2 < 4 — don't just say "we visit C next"
  - If conceptual_state.residual_graph shows a reverse edge with positive residual,
    that's a TEACHING MOMENT — slow down and explain what reverse edges mean
  - If conceptual_state.reverse_edges_used includes {is_reverse: true}, this path uses
    flow cancellation — you MUST explain this concept before narrating the path
  - If conceptual_state.bfs_frontier_order is present, walk through at least the first
    few nodes BFS explored to show HOW the path was found, not just WHAT path was found
  - If conceptual_state.flow_changes shows before/after, reference the specific numbers

  Reference specific numbers from conceptual_state. "The residual capacity on A→B is 3"
  is better than "there's still capacity available."

  When conceptual_state includes 'reverse_edges_used' or similar fields that flag
  non-obvious algorithm behavior, these are your TEACHING MOMENTS — slow down and
  explain them explicitly.

Rules:
- ALWAYS call run_algorithm to get the real trace. Never make up algorithm results.
- ALWAYS use trace_step_indices (not manual viz_actions) in emit_segment. The system generates all visualizations.
- Set appropriate phase labels to track progress
- Keep delay_ms between 300-1000 depending on complexity

SEGMENT BUDGETING:
  Plan your lesson structure before emitting segments. A good lesson has roughly:
  - 2-3 segments: motivation and setup ("why this algorithm?", "here's our data", "here's the key idea")
  - 2-4 segments: demonstrating the pattern on the first few steps (detailed)
  - 3-6 segments: middle section with varying detail (some detailed, some summarized)
  - 1-2 segments: the climax / result / traceback
  - 1-2 segments: synthesis ("what did we learn?", "why does this work?")

  Total: roughly 10-20 segments for most algorithms. If you find yourself emitting 30+ segments, you're being too granular — batch routine steps together.

HANDLING INTERRUPTS:
When a learner interrupts with a question, choose the right explanation_mode:

- "overlay" — spotlight relevant elements, dim everything else, add annotation labels.
  For graphs/trees: use spotlight_nodes (ID strings) and spotlight_edges ({from, to}).
  For arrays/linked lists: use spotlight_indices (0-based index array).
  For tables: use spotlight_cells (array of {row, col}).
  Always include 1-2 annotations with the key insight.

- "rewind" — rewind 1-3 steps and re-explain with different, simpler wording. Works for all renderers.

- "ghost_alternative" — compare the actual choice vs an alternative.
  For graphs/trees: use ghost_path/actual_path (node ID arrays).
  For arrays/linked lists: use ghost_indices/actual_indices (index arrays).
  Include ghost_label and actual_label to explain the comparison.

- "none" — simple factual questions with no visual needs.

When answering interrupts, check the relevant trace steps' conceptual_state for
concrete data to reference. For example, if a learner asks "why did we pick that
path?", the conceptual_state.residual_graph shows exactly which edges had remaining
capacity. Ground your answers in specific numbers from the trace, not abstract
explanations.

After your explanation, emit a bridging segment: "Alright, back to where we were..." and continue the algorithm.

When using overlay mode, be specific about which elements to spotlight — only the ones directly relevant to the question. Add 1-2 short annotations that explain the key insight.

When using rewind mode, your re-narration should use DIFFERENT words than the original — if the learner didn't understand the first time, repeating the same words won't help. Use simpler language, analogies, or break the step into smaller pieces.

When using ghost_alternative mode, always include both the ghost (rejected) choice and the actual (chosen) choice so the learner can visually compare.

ALGORITHM-SPECIFIC TEACHING NOTES:

Max Flow (Ford-Fulkerson / Edmonds-Karp):
  - The RESIDUAL GRAPH is the central concept. Introduce it in your first or second segment,
    before any augmenting path is found. Explain: "Every time we push flow along an edge,
    we reduce its forward residual capacity and create backward residual capacity. This
    backward capacity lets us 'undo' flow later if a better routing exists."
  - When narrating augmenting paths, reference conceptual_state.residual_graph to show
    WHY each edge in the path is traversable (its residual capacity > 0).
  - When conceptual_state.reverse_edges_used contains {is_reverse: true}, this is the
    KEY TEACHING MOMENT of the algorithm. Slow down significantly. Explain that BFS found
    a reverse edge, what that means physically (un-sending flow), and why this is powerful.
  - Use conceptual_state.bfs_frontier_order to show how BFS explored the residual graph
    to find each path — at minimum for the first iteration.
  - The min-cut explanation should connect back to the residual graph: "These are exactly
    the edges where residual capacity is 0 — they're the bottleneck of the whole network."

Dijkstra:
  - Use conceptual_state.priority_queue to show what nodes are candidates and why the
    chosen one has the smallest distance.
  - Use conceptual_state.unvisited_neighbors to preview what relaxations are about to happen.

Kruskal:
  - Use conceptual_state on check_cycle steps to show which component each endpoint belongs to.`;

function sendJSON(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function sendBinary(ws, buffer) {
  if (ws.readyState === ws.OPEN) {
    ws.send(buffer, { binary: true });
  }
}

/**
 * Build the initial user message based on the algorithm type.
 */
function buildInitialPrompt(algorithm, source) {
  const algoInfo = ALGORITHMS[algorithm];
  if (!algoInfo) {
    return `Please teach me the ${algorithm} algorithm step by step. Run the algorithm and narrate each step.`;
  }

  if (algorithm === 'maxflow') {
    return `Please teach me Ford-Fulkerson (Edmonds-Karp) max flow step by step. Use the default flow network. Source is S, sink is T. Run the algorithm and narrate each step.`;
  }

  if (algoInfo.renderer === 'graph') {
    return `Please teach me ${algorithm}'s algorithm step by step. Use the default graph. Start from node ${source}. Run the algorithm and narrate each step.`;
  }

  if (algoInfo.renderer === 'array') {
    const defaultArr = algoInfo.defaultInput?.array;
    if (algorithm === 'binary_search') {
      return `Please teach me binary search step by step. Use the default sorted array ${JSON.stringify(defaultArr)} and search for ${algoInfo.defaultInput.target}. Run the algorithm and narrate each step.`;
    }
    return `Please teach me ${algorithm.replace(/_/g, ' ')} step by step. Use the default array ${JSON.stringify(defaultArr)}. Run the algorithm and narrate each step.`;
  }

  return `Please teach me ${algorithm.replace(/_/g, ' ')} step by step. Use the default input data. Run the algorithm and narrate each step.`;
}

export async function startAgentSession(session, algorithm, graph, source) {
  const { ws } = session;

  sendJSON(ws, { type: 'lesson_start', algorithm, source });

  const messages = [
    {
      role: 'user',
      content: buildInitialPrompt(algorithm, source),
    },
  ];

  let continueLoop = true;
  while (continueLoop) {
    if (ws.readyState !== ws.OPEN) break;

    let response;
    try {
      response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools,
        messages,
      });
    } catch (err) {
      console.error('[Agent] API error:', err.message);
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

        const result = await handleToolCall(session, block, graph, algorithm, source);
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
          // If no interrupt was submitted during pause, send resumed
          if (!session.interruptFlag) {
            sendJSON(ws, { type: 'resumed' });
          }
        }

        // Check for interrupt after emit_segment
        if (block.name === 'emit_segment' && session.interruptFlag) {
          const interrupt = session.interruptFlag;
          session.interruptFlag = null;
          interrupted = true;

          // Add remaining tool results for any unprocessed tool_use blocks
          for (const remaining of response.content) {
            if (remaining.type !== 'tool_use') continue;
            if (toolResults.some((r) => r.tool_use_id === remaining.id)) continue;
            toolResults.push({
              type: 'tool_result',
              tool_use_id: remaining.id,
              content: JSON.stringify({ skipped: true, reason: 'learner interrupt' }),
            });
          }

          // Append interrupt info as a text block in the same user message
          toolResults.push({
            type: 'text',
            text: `[LEARNER INTERRUPT] The learner has a question: "${interrupt.question}". Please use respond_to_interrupt to answer their question, then continue teaching from where you left off.`,
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

async function handleToolCall(session, toolCall, graph, algorithm, source) {
  const { ws } = session;
  const { name, input } = toolCall;

  switch (name) {
    case 'create_graph': {
      const graphData = {
        nodes: input.nodes || graph.nodes,
        edges: input.edges || graph.edges,
        positions: input.positions || graph.positions,
        directed: input.directed !== undefined ? input.directed : (graph.directed !== undefined ? graph.directed : true),
      };
      sendJSON(ws, { type: 'create_graph', graph: graphData });
      session.currentGraph = graphData;
      return { success: true, message: 'Graph created and displayed to learner.' };
    }

    case 'create_visualization': {
      console.log('[Agent] create_visualization panels:', JSON.stringify(input.panels));
      if (input.context_panels) {
        console.log('[Agent] context_panels:', JSON.stringify(input.context_panels));
      }
      sendJSON(ws, {
        type: 'create_visualization',
        panels: input.panels || [],
        context_panels: input.context_panels || [],
      });
      return { success: true, message: 'Visualization and context panels created and displayed to learner.' };
    }

    case 'run_algorithm': {
      const algo = input.algorithm || algorithm;
      const algoInfo = ALGORITHMS[algo];

      if (algoInfo) {
        // Use the registry for all registered algorithms
        try {
          const registryInput = { ...input.input };
          // For graph algorithms, only inject session/tool-call overrides when present.
          // Otherwise let the registry's defaultInput provide the correct graph/source/sink.
          if (algoInfo.renderer === 'graph') {
            if (session.currentGraph && !registryInput.graph) {
              registryInput.graph = session.currentGraph;
            }
            if (input.source && !registryInput.source) {
              registryInput.source = input.source;
            }
            if (input.sink) {
              registryInput.sink = input.sink;
            }
          }
          const result = runRegisteredAlgorithm(algo, registryInput);
          console.log(`[Agent] run_algorithm '${algo}' returned ${result.trace.length} steps, renderer: ${result.renderer}`);

          // ── Store trace on session for deterministic mapping ──
          session.currentTrace = result.trace;
          session.currentRenderer = result.renderer;
          session.currentAlgorithm = algo;
          session.mapperState = {};

          // ── Auto-configure visualization + context panels ──
          const contextPanels = getDefaultContextPanels(algo);
          console.log(`[Agent] Auto-setup for '${algo}': renderer=${algoInfo.renderer}, contextPanels=${contextPanels.map(p => p.id).join(',')}, sessionGraph=${!!session.currentGraph}`);

          if (algoInfo.renderer === 'graph') {
            // Auto-create graph if not already set up
            if (!session.currentGraph) {
              const graphData = registryInput.graph || algoInfo.defaultInput?.graph;
              if (graphData) {
                const directed = graphData.directed !== undefined ? graphData.directed : true;
                console.log(`[Agent] Auto-creating graph: ${graphData.nodes?.length} nodes, directed=${directed}`);
                sendJSON(ws, { type: 'create_graph', graph: { ...graphData, directed } });
                session.currentGraph = graphData;
              }
            }
            // Send context panels via create_visualization
            if (contextPanels.length > 0) {
              sendJSON(ws, {
                type: 'create_visualization',
                panels: [],
                context_panels: contextPanels,
              });
            }
          } else {
            // Non-graph: auto-send create_visualization with renderer + context panels
            sendJSON(ws, {
              type: 'create_visualization',
              panels: [{ renderer: algoInfo.renderer, config: {} }],
              context_panels: contextPanels,
            });
          }

          const panelNames = contextPanels.map((p) => p.id);
          return {
            success: true,
            algorithm: algo,
            renderer: result.renderer,
            trace: result.trace,
            step_count: result.trace.length,
            source: registryInput.source,
            visualization_auto_configured: true,
            context_panels: panelNames,
            message: `Algorithm executed. Visualization and context panels auto-configured. Use emit_segment with trace_step_indices to teach. You have ${result.trace.length} trace steps available (indices 0 to ${result.trace.length - 1}).`,
          };
        } catch (err) {
          return { error: err.message };
        }
      }

      // Fallback: legacy path for unregistered algorithms
      const src = input.source || source;
      const trace = runAlgorithm(algo, session.currentGraph || graph, src);
      session.currentTrace = trace;
      session.currentAlgorithm = algo;
      session.mapperState = {};
      return {
        success: true,
        algorithm: algo,
        source: src,
        trace,
        step_count: trace.length,
        message: `Algorithm executed successfully. ${trace.length} steps in trace. Use emit_segment with trace_step_indices to narrate each step.`,
      };
    }

    case 'emit_segment': {
      const segmentId = Math.random().toString(36).slice(2, 8);

      // ── Build viz_actions from trace_step_indices (deterministic mapper) ──
      let allVizActions = [];
      if (input.trace_step_indices && input.trace_step_indices.length > 0 && session.currentTrace) {
        for (const idx of input.trace_step_indices) {
          const step = session.currentTrace[idx];
          if (!step) {
            console.warn(`[Agent] trace_step_indices: index ${idx} out of bounds (trace has ${session.currentTrace.length} steps)`);
            continue;
          }
          const { viz: vizActs, ctx: ctxActs } = mapTraceStep(
            session.currentAlgorithm,
            session.currentRenderer,
            step,
            session.mapperState
          );
          allVizActions.push(...vizActs, ...ctxActs);
        }
      } else if (input.trace_step_indices && !session.currentTrace) {
        console.warn('[Agent] trace_step_indices provided but no currentTrace on session — was run_algorithm called?');
      }
      // Merge any explicit viz_actions from agent (rare overrides / backward compat)
      if (input.viz_actions && input.viz_actions.length > 0) {
        allVizActions.push(...input.viz_actions);
      }

      if (allVizActions.length === 0 && input.narration) {
        console.warn(`[Agent] emit_segment has narration but NO viz_actions (trace_step_indices: ${JSON.stringify(input.trace_step_indices)}, viz_actions: ${input.viz_actions?.length || 0})`);
      }
      console.log(`[Agent] emit_segment viz_actions (${allVizActions.length}, trace_steps: ${input.trace_step_indices?.length || 0}):`, JSON.stringify(allVizActions).slice(0, 500));

      sendJSON(ws, {
        type: 'segment_start',
        segment_id: segmentId,
        narration: input.narration,
        viz_actions: allVizActions,
        phase: input.phase || '',
      });

      // TTS or simulated delay (synthesizeAndStream waits for playback to finish)
      const sendBinaryFn = (buffer) => sendBinary(ws, buffer);
      const sendJsonFn = (obj) => sendJSON(ws, obj);
      await synthesizeAndStream(sendBinaryFn, input.narration, session.speedMultiplier, sendJsonFn);

      // Small buffer between segments for natural pacing
      const gapMs = 300 / session.speedMultiplier;
      await new Promise((resolve) => setTimeout(resolve, gapMs));

      sendJSON(ws, { type: 'segment_end', segment_id: segmentId });

      return {
        success: true,
        message: 'Segment delivered. Narration played and animations applied.',
      };
    }

    case 'respond_to_interrupt': {
      sendJSON(ws, {
        type: 'interrupt_response',
        answer: input.answer,
        explanation_mode: input.explanation_mode || 'none',
        overlay: input.overlay || null,
        rewind: input.rewind || null,
        ghost_alternative: input.ghost_alternative || null,
        viz_actions: input.viz_actions || [],
      });

      const sendBinaryFn = (buffer) => sendBinary(ws, buffer);
      const sendJsonFn = (obj) => sendJSON(ws, obj);
      await synthesizeAndStream(sendBinaryFn, input.answer, session.speedMultiplier, sendJsonFn);

      // If rewind mode, also narrate each replayed step
      if (input.explanation_mode === 'rewind' && input.rewind?.narration_per_step) {
        for (const stepNarration of input.rewind.narration_per_step) {
          await new Promise((r) => setTimeout(r, 800));
          sendJSON(ws, { type: 'rewind_step_narration', narration: stepNarration });
          await synthesizeAndStream(sendBinaryFn, stepNarration, session.speedMultiplier, sendJsonFn);
        }
      }

      // Signal explanation complete so frontend can clean up
      await new Promise((resolve) => setTimeout(resolve, 500));
      sendJSON(ws, { type: 'explanation_complete' });

      return {
        success: true,
        message: 'Interrupt response delivered with explanation. Continue teaching.',
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
