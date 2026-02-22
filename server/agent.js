// Claude agent loop with tool dispatch

import Anthropic from '@anthropic-ai/sdk';
import { tools } from './tools.js';
import { runAlgorithm } from './algorithms.js';
import { runRegisteredAlgorithm, ALGORITHMS } from './algorithms/registry.js';
import { synthesizeAndStream } from './tts.js';

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

You support multiple visualization types:

GRAPH ALGORITHMS (renderer: 'graph'):
  Use create_graph to set up the graph, then run_algorithm + emit_segment.
  Viz actions (legacy format): highlight_node, highlight_edge, mark_visited, mark_current, set_label, reset_highlights, show_path, update_table.

MST ALGORITHMS (Kruskal, Prim):
  When setting up the graph, pass directed: false so edges appear without arrowheads.
  When adding an edge to the MST, use highlight_edge with className: 'mst-edge' to visually mark it:
    { action: 'highlight_edge', from: 'A', to: 'C', className: 'mst-edge' }
  This renders the edge in green with thicker width so the MST is clearly visible.

SORTING ALGORITHMS (renderer: 'array'):
  Use create_visualization with renderer:'array'.
  Run the algorithm to get the trace, then narrate each step.
  Viz actions use the new format: { renderer: 'array', action: '...', params: {...} }
  Actions: set_data, highlight, swap, compare, place, partition, mark_sorted, set_pointer, clear_pointers, reset.
  - swap: { i, j } — swap two elements in-place (e.g. quicksort, bubble sort)
  - place: { index, value } — put a value at a specific index (e.g. mergesort merge step)
  - set_data: { values: [...] } — replace the entire array (use sparingly, e.g. after a full merge pass)
  When narrating swaps, always mention BOTH the values being swapped and WHY.
  When narrating comparisons, state the result and its implication.
  Mark elements as sorted when they reach their final position.

SEARCHING ALGORITHMS (renderer: 'array'):
  Use create_visualization with renderer:'array'.
  Actions: set_data, highlight, set_pointer, mark_sorted.
  Use pointers to show left/right/mid boundaries.

DYNAMIC PROGRAMMING (renderer: 'table'):
  Use create_visualization with renderer:'table'.
  Actions: init_grid, fill_cell, highlight_cell, highlight_row, highlight_col, show_dependency_arrow, mark_optimal, reset.
  IMPORTANT: The trace's init_table step includes rowLabels and colLabels with descriptive names (e.g. item names for knapsack, substrings for LCS). Always pass these as row_headers and col_headers in your init_grid call so the learner can see what each row/column represents.
  The key teaching strategy for DP:
  1. Explain the subproblem structure first (what does dp[i][j] mean?)
  2. Show the recurrence relation
  3. Fill the table cell by cell, explaining the choice at each step
  4. Use show_dependency_arrow to visualize which cells feed into the current one
  5. At the end, do a traceback to show the optimal solution path

TREES (renderer: 'tree'):
  Use create_visualization with renderer:'tree'.
  Actions: set_tree, highlight_node, highlight_edge, insert_node, delete_node, rotate_left, rotate_right, recolor_node, sift_up, sift_down, mark_level, update_heap_array, reset.
  - set_tree: { nodes: [{id, value}], edges: [{from, to, side:'left'|'right'}], root: id } — replace entire tree. The trace's 'tree' field can be passed directly.
  - insert_node: { id, value, parent, side } — add one node. Omit parent for root.
  - highlight_node: { id, className } — className: 'current', 'comparing', 'inserted', etc.
  - highlight_edge: { from, to, className }
  For BST insertion, the trace includes a full 'tree' snapshot at each insert step. Use set_tree with it to keep the visualization in sync.

LINKED STRUCTURES (renderer: 'linked'):
  Use create_visualization with renderer:'linked'.
  Actions: set_list, highlight_node, highlight_pointer, insert_after, delete_node, reverse_segment, push, pop, enqueue, dequeue, set_pointer, reset.
  - set_list: { values: [1, 2, 3], mode: 'list'|'stack'|'queue' } — set the full list
  - highlight_node: { indices: [0, 1], className } — highlight nodes by index
  - insert_after: { index, value } — insert a new node after the given index
  - delete_node: { index } — delete node at index
  - set_pointer: { name, index } — show a named pointer (e.g. 'prev', 'curr') at index

CONTEXT PANELS:
You can declare supplementary context panels in create_visualization to show metadata alongside the main visualization. These help learners track algorithm state.

Available panel types:
- key_value: Key-value pairs (distances, costs, variable values)
- collection: Ordered items (priority queue, stack, visited set)
- expression: Formula being evaluated (DP recurrence, comparison)
- log: Scrolling decision log (what was chosen and why)
- pseudocode: Algorithm pseudocode with current line highlighted

Declare panels in create_visualization:
  context_panels: [
    { id: "distances", type: "key_value", title: "Distances" },
    { id: "pq", type: "collection", title: "Priority Queue" }
  ]

Update panels via viz_actions in emit_segment:
  { renderer: "context", action: "update", params: {
    panel_id: "distances",
    entries: [
      { key: "A", value: 0, status: "default" },
      { key: "B", value: 4, status: "updated" }
    ]
  }}

For log panels, use action: "append_log" to add entries without replacing:
  { renderer: "context", action: "append_log", params: {
    panel_id: "decisions",
    entries: [{ text: "Took Laptop (w=3, v=4)", type: "decision" }]
  }}

For collection panels, send the full items array each time:
  { renderer: "context", action: "update", params: {
    panel_id: "pq",
    items: [{ value: "B (4)", status: "active" }, { value: "C (7)" }],
    style: "queue"
  }}

RECOMMENDED CONTEXT PANELS BY ALGORITHM TYPE:
- Graph (Dijkstra, BFS, DFS): key_value for distances/state + collection for queue/stack
- Graph (Kruskal, Prim): key_value for MST weight + collection for edge candidates
- Sorting: pseudocode for the algorithm + key_value for stats (comparisons, swaps)
- DP: expression for current recurrence + log for decisions
- Trees: key_value for node properties + collection for traversal order
- Linked: key_value for pointer positions

Always update context panels in the SAME emit_segment as related viz_actions so they stay synchronized.

USING CONTEXT PANELS FOR TEACHING:
  Context panels aren't just metadata displays — they're teaching tools. Use them to:
  - Keep the recurrence relation visible (expression panel) so the learner can follow along as you fill each cell
  - Show the decision log (log panel) so the learner can see the narrative of choices building up
  - Display pseudocode (pseudocode panel) with the current line highlighted so the learner connects code to execution
  
  Update context panels IN THE SAME emit_segment as the related viz action. The learner should see the expression panel 
  highlight "max(dp[1][2], dp[0][0] + 4)" at the exact moment you're filling that cell in the table.

SEGMENT BUDGETING:
  Plan your lesson structure before emitting segments. A good lesson has roughly:
  - 2-3 segments: motivation and setup ("why this algorithm?", "here's our data", "here's the key idea")
  - 2-4 segments: demonstrating the pattern on the first few steps (detailed)
  - 3-6 segments: middle section with varying detail (some detailed, some summarized)
  - 1-2 segments: the climax / result / traceback
  - 1-2 segments: synthesis ("what did we learn?", "why does this work?")
  
  Total: roughly 10-20 segments for most algorithms. If you find yourself emitting 30+ segments, you're being too granular — batch routine steps together.


For ALL algorithms:
  1. Call create_visualization (or create_graph for graph algorithms) first
  2. Give a brief intro (1-2 segments)
  3. Call run_algorithm to get the trace
  4. Narrate each step with viz_actions that animate what you're describing
  5. Summarize results

CRITICAL: Every emit_segment MUST include viz_actions to animate the visualization. Without viz_actions, the learner sees nothing.

Example viz_actions format:
  viz_actions: [{ renderer: "array", action: "swap", params: { i: 2, j: 5 } }]
  viz_actions: [{ renderer: "table", action: "fill_cell", params: { row: 1, col: 3, value: 4 } }]

Rules:
- ALWAYS call run_algorithm to get the real trace. Never make up algorithm results.
- ALWAYS include viz_actions in every emit_segment call. Map each trace step to the appropriate renderer action.
- Set appropriate phase labels to track progress
- Keep delay_ms between 300-1000 depending on complexity

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

After your explanation, emit a bridging segment: "Alright, back to where we were..." and continue the algorithm.

When using overlay mode, be specific about which elements to spotlight — only the ones directly relevant to the question. Add 1-2 short annotations that explain the key insight.

When using rewind mode, your re-narration should use DIFFERENT words than the original — if the learner didn't understand the first time, repeating the same words won't help. Use simpler language, analogies, or break the step into smaller pieces.

When using ghost_alternative mode, always include both the ghost (rejected) choice and the actual (chosen) choice so the learner can visually compare.`;

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
    return `Please teach me the ${algorithm} algorithm step by step. Create the visualization first, then run the algorithm and narrate each step.`;
  }

  const contextHint = ' Use context panels to show relevant supplementary data like tables, queues, or pseudocode.';

  if (algoInfo.renderer === 'graph') {
    return `Please teach me ${algorithm}'s algorithm step by step. Use the default graph with nodes A-F. Start from node ${source}. Create the graph first with appropriate context panels (like a distance table and priority queue), then run the algorithm and narrate each step with visualizations.`;
  }

  if (algoInfo.renderer === 'array') {
    const defaultArr = algoInfo.defaultInput?.array;
    if (algorithm === 'binary_search') {
      return `Please teach me binary search step by step. Use the default sorted array ${JSON.stringify(defaultArr)} and search for ${algoInfo.defaultInput.target}. Create the array visualization first, then run the algorithm and narrate each step.${contextHint}`;
    }
    return `Please teach me ${algorithm.replace(/_/g, ' ')} step by step. Use the default array ${JSON.stringify(defaultArr)}. Create the array visualization first, then run the algorithm and narrate each step.${contextHint}`;
  }

  if (algoInfo.renderer === 'table') {
    return `Please teach me ${algorithm.replace(/_/g, ' ')} step by step. Use the default input data. Create the table visualization first, then run the algorithm and narrate each step.${contextHint}`;
  }

  return `Please teach me ${algorithm.replace(/_/g, ' ')} step by step. Create the visualization first, then run the algorithm and narrate each step.${contextHint}`;
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
          // For graph algorithms, inject the current graph and source
          if (algoInfo.renderer === 'graph') {
            registryInput.graph = registryInput.graph || session.currentGraph || graph;
            registryInput.source = registryInput.source || input.source || source;
          }
          const result = runRegisteredAlgorithm(algo, registryInput);
          console.log(`[Agent] run_algorithm '${algo}' returned ${result.trace.length} steps, renderer: ${result.renderer}`);
          return {
            success: true,
            algorithm: algo,
            renderer: result.renderer,
            trace: result.trace,
            step_count: result.trace.length,
            source: registryInput.source,
            message: `Algorithm executed successfully. ${result.trace.length} steps in trace. Use emit_segment to narrate each step.`,
          };
        } catch (err) {
          return { error: err.message };
        }
      }

      // Fallback: legacy path for unregistered algorithms
      const src = input.source || source;
      const trace = runAlgorithm(algo, session.currentGraph || graph, src);
      return {
        success: true,
        algorithm: algo,
        source: src,
        trace,
        step_count: trace.length,
        message: `Algorithm executed successfully. ${trace.length} steps in trace. Use emit_segment to narrate each step.`,
      };
    }

    case 'emit_segment': {
      const segmentId = Math.random().toString(36).slice(2, 8);
      const vizActions = input.viz_actions || [];
      console.log(`[Agent] emit_segment viz_actions (${vizActions.length}):`, JSON.stringify(vizActions).slice(0, 500));

      sendJSON(ws, {
        type: 'segment_start',
        segment_id: segmentId,
        narration: input.narration,
        viz_actions: vizActions,
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
