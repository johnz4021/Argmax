# Argmax: Reliable Viz Actions via Deterministic Trace Mapping

## Problem

The Claude agent in `server/agent.js` is responsible for both narration AND constructing `viz_actions` + context panel updates in every `emit_segment` call. This is unreliable — the agent sometimes forgets context panels, produces inconsistent animations, or skips viz actions entirely. The algorithm traces already contain all the information needed to produce correct viz actions deterministically.

## Solution: Deterministic Trace Mapper

Move viz_action and context panel construction OUT of the agent and into a deterministic mapper layer. The agent's only job becomes deciding **what to narrate** and **pacing** — things LLMs are good at. A pure-JS mapper converts each trace step into the correct viz_actions and context updates — things that should never vary.

## Architecture Change

**Current flow:**
```
trace → agent reads trace → agent emits narration + viz_actions + context updates (UNRELIABLE)
```

**New flow:**
```
trace → deterministic mapper produces viz_actions + context updates (RELIABLE)
     → agent only decides narration + which steps to group + pacing
```

## Implementation Steps

### Step 1: Create `server/vizMapper.js`

Create a mapper module that exports a single function:

```js
/**
 * Given a renderer type and a trace step object, return:
 * {
 *   vizActions: [...],       // array of { renderer, action, params }
 *   contextUpdates: [...],   // array of { renderer: 'context', action, params }
 * }
 */
export function mapTraceStep(algorithm, rendererType, step, algoState)
```

The `algoState` parameter is a mutable object the mapper uses to track cumulative state across steps (e.g., which nodes are visited, current MST weight, etc.) — initialized at the start of each lesson.

Implement mappers for each renderer type by examining what the existing trace steps contain (look at the trace output from each algorithm file) and what viz actions each renderer component accepts (look at the `apply*Action` functions in each renderer component):

**Graph mapper** — handles trace step types from `server/algorithms.js` and `server/algorithms/graph/*.js`:
- `init` → update distances context panel
- `visit_node` → `mark_current` + update distances/visited context panels  
- `examine_edge` → `highlight_edge` with className 'examining'
- `relax` / `update` → `highlight_edge` + `set_label` + update distances context panel with status 'updated'
- `discover` → `highlight_node` + `highlight_edge` + update queue context panel
- `backtrack` → `mark_visited`
- `result` → `show_path` for each shortest path
- `consider_edge` (Kruskal/Prim) → `highlight_edge` examining + log append
- `add_to_mst` → `highlight_edge` mst-edge + update MST weight context panel + log append
- `reject_edge` → `highlight_edge` strikethrough + log append
- `check_cycle` → log append only
- `update_key` (Prim) → update distances context panel
- `find_augmenting_path` (maxflow) → highlight path nodes/edges as augmenting + update flow status + log append
- `push_flow` → `reset_highlights` + `update_edge_label` for all edges + mark saturated + update flow status
- `compute_min_cut` → highlight source-side/sink-side nodes + min-cut edges

**Array mapper** — handles trace step types from `server/algorithms/sorting/*.js` and `server/algorithms/searching/*.js`:
- `init` → `set_data`
- `compare` → `compare` with i,j from step.indices
- `swap` → `swap` with step.i, step.j
- `place` → `place` with step.index, step.value
- `select_pivot` → `partition`
- `pivot_placed` / `mark_sorted` → `mark_sorted`
- `select_key` → `highlight` active
- `insert` (insertion sort) → `set_data` with step.array if present, else `place`
- `divide` (mergesort) → `highlight` the range
- `merge_start` → `highlight` the merge range
- `merge_complete` → briefly mark merged range
- `check_mid` (binary search) → `set_pointer` for left/right/mid + `highlight` mid
- `eliminate_left`/`eliminate_right` → update pointers
- `found` → `mark_sorted` on found index
- `recurse` → informational only (no viz needed usually)
- `pass_start` / `early_exit` → informational

**Table mapper** — handles trace step types from `server/algorithms/dp/*.js`:
- `init_table` → `init_grid` with step.rows, step.cols, step.rowLabels as row_headers, step.colLabels as col_headers. Also update expression context panel with recurrence.
- `consider_item` (knapsack) → `highlight_row` + update expression context panel
- `fill_cell` / `skip_cell` → `fill_cell` + `highlight_cell` as 'current' + `show_dependency_arrow` from step.from cells. Update expression context panel with the specific formula. Append to log panel with the decision.
- `compare_chars` (LCS/edit distance) → `highlight_cell` current position
- `traceback` → `highlight_cell` as 'optimal' + `mark_optimal`
- `consider_coin` (coin change) → informational
- `result` → mark optimal path cells

**Tree mapper** — handles trace step types from `server/algorithms/tree/*.js`:
- `init` → informational
- `insert_start` → informational
- `compare` (BST) → `highlight_node` on compared node as 'comparing'
- `insert` (BST) → `set_tree` with step.tree + `highlight_node` as 'inserted'
- `insert_start` (heap) → informational
- `place` (heap) → `set_tree` rebuilt from heap array + `highlight_node`
- `sift_compare` → `highlight_node` on both as 'comparing' + `highlight_edge`
- `sift_swap` → `set_tree` rebuilt + `highlight_node` as 'sifting'
- `sift_done` → `highlight_node` as 'inserted' (settled)
- `extract_start` → `highlight_node` root as 'current'
- `extract_swap` → rebuild tree + highlight
- `extract_remove` → rebuild tree
- `result` → clear highlights

**Linked mapper** — handles trace step types from `server/algorithms/linked/*.js`:
- `init` → `set_list` with step.list or step.stack or step.queue, and mode
- `set_pointers` → `set_pointer` for prev/current/next
- `step` (reversal) → `highlight_node` current as 'current' + `set_pointer` for prev/current/next
- `advance` → `set_pointer` updates + `reverse_segment` on processed portion
- `push` → `push` with value + `highlight_node` as 'inserted'
- `pop` → `highlight_node` index 0 as 'deleted' then `pop`
- `enqueue` → `enqueue` with value
- `dequeue` → `highlight_node` index 0 as 'deleted' then `dequeue`
- `peek` → `highlight_node` index 0 as 'highlighted'
- `pop_empty` / `dequeue_empty` → no viz, just informational
- `result` → reset highlights

For each mapper, also produce default context panel updates. For example, the tree mapper for heap operations should update a key_value panel showing the heap array representation.

### Step 2: Create `server/contextPanelDefaults.js`

Export a function that returns the default context panels for each algorithm:

```js
export function getDefaultContextPanels(algorithm) → panel definitions[]
```

This replaces the agent needing to decide which panels to create. Examples:

- `dijkstra` → `[{ id: 'distances', type: 'key_value', title: 'Distances' }, { id: 'pq', type: 'collection', title: 'Priority Queue' }]`
- `bfs` → `[{ id: 'visited', type: 'collection', title: 'Visited' }, { id: 'pq', type: 'collection', title: 'Queue' }]`
- `dfs` → `[{ id: 'visited', type: 'collection', title: 'Visited' }]`
- `kruskal` → `[{ id: 'mst_weight', type: 'key_value', title: 'MST' }, { id: 'decisions', type: 'log', title: 'Edge Decisions' }]`
- `prim` → `[{ id: 'distances', type: 'key_value', title: 'Keys' }, { id: 'decisions', type: 'log', title: 'Decisions' }]`
- `maxflow` → `[{ id: 'flow_status', type: 'key_value', title: 'Flow Status' }, { id: 'aug_paths', type: 'log', title: 'Augmenting Paths' }]`
- `quicksort`, `mergesort`, etc. → `[{ id: 'pseudocode', type: 'pseudocode', title: 'Algorithm' }, { id: 'stats', type: 'key_value', title: 'Stats' }]`
- `binary_search` → `[{ id: 'bounds', type: 'key_value', title: 'Search Bounds' }]`
- `knapsack` → `[{ id: 'expression', type: 'expression', title: 'Recurrence' }, { id: 'decisions', type: 'log', title: 'Decisions' }]`
- `lcs` → `[{ id: 'expression', type: 'expression', title: 'Recurrence' }, { id: 'decisions', type: 'log', title: 'Decisions' }]`
- `edit_distance` → `[{ id: 'expression', type: 'expression', title: 'Recurrence' }, { id: 'decisions', type: 'log', title: 'Decisions' }]`
- `coin_change` → `[{ id: 'expression', type: 'expression', title: 'Recurrence' }, { id: 'decisions', type: 'log', title: 'Decisions' }]`
- `bst_insert` → `[{ id: 'stats', type: 'key_value', title: 'Tree Info' }]`
- `heap_operations` → `[{ id: 'heap_array', type: 'collection', title: 'Heap Array' }]`
- `linked_list_reversal` → `[{ id: 'pointers', type: 'key_value', title: 'Pointers' }]`
- `stack_operations` → `[{ id: 'stats', type: 'key_value', title: 'Stack Info' }]`
- `queue_operations` → `[{ id: 'stats', type: 'key_value', title: 'Queue Info' }]`

### Step 3: Modify `server/agent.js` — New `emit_segment` tool handler

Change the `emit_segment` tool handler so that:

1. The tool now accepts an optional `trace_step_indices` field (array of integers) instead of requiring `viz_actions`.
2. When `trace_step_indices` is present, the handler calls `mapTraceStep()` for each referenced trace step and merges the resulting vizActions + contextUpdates.
3. These auto-generated actions are sent to the client as before.
4. If the agent also provides explicit `viz_actions`, those are merged AFTER the auto-generated ones (allowing overrides, though this should be rare).

Store the trace result and the algoState on the session object after `run_algorithm` completes:

```js
// In handleToolCall for 'run_algorithm':
session.currentTrace = result.trace;
session.currentRenderer = result.renderer;
session.currentAlgorithm = algo;
session.mapperState = {}; // fresh state for the mapper

// In handleToolCall for 'emit_segment':
let allVizActions = [];
if (input.trace_step_indices && session.currentTrace) {
  for (const idx of input.trace_step_indices) {
    const step = session.currentTrace[idx];
    if (!step) continue;
    const { viz, ctx } = mapTraceStep(
      session.currentAlgorithm,
      session.currentRenderer,
      step,
      session.mapperState
    );
    allVizActions.push(...viz, ...ctx);
  }
}
// Merge any explicit viz_actions from agent (rare overrides)
if (input.viz_actions) {
  allVizActions.push(...normalizeVizActions(input.viz_actions));
}
```

### Step 4: Modify the `create_visualization` / `create_graph` tool handlers

When `run_algorithm` returns, automatically send `create_visualization` with the correct panels based on the algorithm, using `getDefaultContextPanels()`. This means the agent doesn't need to call `create_visualization` or `create_graph` with context panel definitions — it happens automatically.

Add a new auto-setup phase in `handleToolCall` for `run_algorithm`:

```js
// After running the algorithm, auto-send visualization setup
const contextPanels = getDefaultContextPanels(algo);
if (algoInfo.renderer === 'graph') {
  const graphData = registryInput.graph || algo.defaultInput.graph;
  sendJSON(ws, { type: 'create_graph', graph: graphData });
  session.currentGraph = graphData;
} else {
  sendJSON(ws, {
    type: 'create_visualization',
    panels: [{ renderer: algoInfo.renderer, config: {} }],
    context_panels: contextPanels,
  });
}
// Always send context panels
if (contextPanels.length > 0) {
  sendJSON(ws, {
    type: 'create_visualization',  // or a separate message if graph was used
    panels: [],
    context_panels: contextPanels,
  });
}
```

Actually, cleaner approach: modify the `run_algorithm` tool result to include information about what was auto-set-up, so the agent knows not to call create_visualization again.

### Step 5: Update the `emit_segment` tool schema in `server/tools.js`

Add the new field to the tool schema:

```js
trace_step_indices: {
  type: 'array',
  items: { type: 'integer' },
  description: 'Indices into the algorithm trace (from run_algorithm) to animate in this segment. The system will automatically generate the correct viz_actions and context panel updates. You can reference multiple steps to batch them into one segment.',
},
```

Keep `viz_actions` as optional for backward compat / edge cases, but update the description to say the agent should prefer `trace_step_indices`.

### Step 6: Simplify the SYSTEM_PROMPT in `server/agent.js`

The massive section of the system prompt that explains viz action formats, context panel construction, and renderer-specific action names can be **dramatically shortened**. Replace it with:

```
For ALL algorithms:
1. Call run_algorithm to get the trace
2. The system automatically sets up the visualization and context panels
3. Narrate each step using emit_segment with trace_step_indices pointing to the trace steps you want to animate
4. Group steps intelligently — landmark steps get their own segment, routine steps can be batched

Example emit_segment calls:
  // Detailed step (one trace step)
  emit_segment({ narration: "Now we visit node B...", trace_step_indices: [3], phase: "Visiting B" })
  
  // Batched routine steps (multiple trace steps animated together)
  emit_segment({ narration: "The next three cells follow the same pattern...", trace_step_indices: [12, 13, 14], phase: "Row 2" })
  
  // Summary with no animation
  emit_segment({ narration: "And that completes Dijkstra's algorithm!", trace_step_indices: [], phase: "Summary" })

You do NOT need to construct viz_actions or context panel updates — the system does this automatically from the trace.
Focus entirely on WHAT to say and HOW to pace the lesson.
```

Keep the pedagogical guidance (motivate before mechanism, vary pacing, narrate insight not description, etc.) — that's what the agent should focus on.

### Step 7: Update `create_graph` and `create_visualization` handling

Modify so that when `run_algorithm` auto-sets up visualization, the tool result tells the agent:

```json
{
  "success": true,
  "trace": [...],
  "step_count": 25,
  "renderer": "table",
  "visualization_auto_configured": true,
  "context_panels": ["expression", "decisions"],
  "message": "Algorithm executed. Visualization and context panels auto-configured. Use emit_segment with trace_step_indices to teach. You have 25 trace steps available."
}
```

The agent can still call `create_graph` / `create_visualization` if it wants custom setup, but for the standard path it doesn't need to.

### Summary of Files to Change

1. **CREATE** `server/vizMapper.js` — deterministic trace→viz mapper (the big one)
2. **CREATE** `server/contextPanelDefaults.js` — default panels per algorithm  
3. **MODIFY** `server/agent.js` — new emit_segment handling, auto-setup after run_algorithm, store trace on session
4. **MODIFY** `server/tools.js` — add trace_step_indices to emit_segment schema
5. **MODIFY** `server/agent.js` SYSTEM_PROMPT — simplify dramatically, remove viz action construction guidance

### What NOT to Change

- No client changes needed. The client already handles viz_actions correctly — the problem is only that the server agent was producing them inconsistently.
- No algorithm implementation changes. The traces are already good.
- No renderer changes. They already handle all the action types.

### Testing Approach

After implementation, test by running each algorithm category and verifying:
1. Context panels always appear (check browser console for `[State] SET_CONTEXT_PANELS`)
2. Viz actions always fire (check console for `[Registry] Applying action`)
3. The agent's narration still flows naturally (it should be BETTER since it's not distracted by constructing viz actions)
4. Interrupts still work (the mapper doesn't affect interrupt handling)
