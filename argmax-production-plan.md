# Argmax Production Build Plan: Full Algorithms Course Learning Assistant

## Context

Argmax is an AI algorithm tutor with a Claude agent loop, Cytoscape.js graph visualization, ElevenLabs TTS, and a WebSocket-driven teaching flow. It currently supports Dijkstra, BFS, and DFS on directed weighted graphs with a visual explanation system (overlay, rewind, ghost_alternative modes).

This plan expands it into a **full undergraduate algorithms course companion** with multiple visualization renderers, a tiered trace generation system, and coverage of sorting, dynamic programming, trees, and linked structures — not just graphs.

**Read the entire plan before writing any code.** Phases must be completed in order. Each phase ends with a working, testable system.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Claude Agent                          │
│         (picks tools, narrates, teaches)                 │
│                                                          │
│  Tools: create_visualization, emit_segment,              │
│         run_algorithm, respond_to_interrupt,              │
│         + renderer-specific action tools                 │
└──────────────────────┬──────────────────────────────────┘
                       │ WebSocket (JSON + binary audio)
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  Server (Express + WS)                    │
│                                                          │
│  agent.js ─── tools.js ─── algorithms/                   │
│                              ├── registry.js              │
│                              ├── graph/ (dijkstra, bfs…) │
│                              ├── sorting/ (quick, merge…)│
│                              ├── dp/ (knapsack, lcs…)    │
│                              └── tree/ (bst, avl…)       │
│                                                          │
│  tts.js (ElevenLabs streaming, unchanged)                │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   Client (React + Vite)                   │
│                                                          │
│  App.jsx → VizLayout.jsx (manages panels)                │
│              ├── GraphRenderer.jsx   (Cytoscape.js)      │
│              ├── ArrayRenderer.jsx   (D3/React)          │
│              ├── TableRenderer.jsx   (React grid)        │
│              ├── TreeRenderer.jsx    (D3 tree layout)    │
│              └── LinkedRenderer.jsx  (React/SVG)         │
│                                                          │
│  lib/rendererRegistry.js (routes actions to renderers)   │
│  lib/vizActions.js (existing, becomes graph-specific)    │
│  hooks/useTutorState.js (extended for multi-renderer)    │
└─────────────────────────────────────────────────────────┘
```

**Key principle:** The agent speaks a unified viz protocol. The client routes actions to the correct renderer. Renderers are independent — adding one never breaks another.

---

## PHASE 1: Foundation — Unified Viz Protocol & Renderer Registry

**Goal:** Refactor the existing single-renderer system into a multi-renderer architecture without breaking any current functionality. After this phase, Dijkstra/BFS/DFS should work exactly as before, but through the new renderer registry.

### 1.1 Define the Unified Viz Action Protocol

Create `shared/vizProtocol.js` (imported by both server and client):

```javascript
/**
 * Every viz action flowing through the system has this shape.
 * The `renderer` field routes it to the correct client-side component.
 * The `action` + `params` are renderer-specific.
 */
const VizAction = {
  renderer: 'graph',           // 'graph' | 'array' | 'table' | 'tree' | 'linked'
  action: 'highlight_node',    // renderer-specific action name
  params: { node: 'A' }       // renderer-specific params
};

/**
 * Renderer capabilities — used to validate actions and generate tool schemas.
 */
export const RENDERER_ACTIONS = {
  graph: [
    'highlight_node', 'highlight_edge', 'mark_visited', 'mark_current',
    'set_label', 'reset_highlights', 'show_path', 'update_table',
    'highlight_component', 'mark_mst_edge', 'set_edge_label',
    'set_directed', 'set_undirected'
  ],
  array: [
    'set_data', 'highlight', 'swap', 'compare', 'partition',
    'mark_sorted', 'set_pointer', 'clear_pointers', 'reset',
    'slide_window', 'set_label'
  ],
  table: [
    'init_grid', 'fill_cell', 'highlight_cell', 'highlight_row',
    'highlight_col', 'show_dependency_arrow', 'set_row_header',
    'set_col_header', 'mark_optimal', 'reset'
  ],
  tree: [
    'set_tree', 'highlight_node', 'highlight_edge', 'rotate_left',
    'rotate_right', 'insert_node', 'delete_node', 'recolor_node',
    'sift_up', 'sift_down', 'mark_level', 'reset'
  ],
  linked: [
    'set_list', 'highlight_node', 'highlight_pointer', 'insert_after',
    'delete_node', 'reverse_segment', 'set_pointer', 'push', 'pop',
    'enqueue', 'dequeue', 'reset'
  ]
};

/**
 * Algorithm → renderer mapping. Used by the algorithm selector
 * and agent system prompt to know which renderer an algorithm needs.
 */
export const ALGORITHM_RENDERERS = {
  // Graph renderer
  dijkstra:       { renderer: 'graph', category: 'Graph Algorithms' },
  bfs:            { renderer: 'graph', category: 'Graph Algorithms' },
  dfs:            { renderer: 'graph', category: 'Graph Algorithms' },
  kruskal:        { renderer: 'graph', category: 'Graph Algorithms' },
  prim:           { renderer: 'graph', category: 'Graph Algorithms' },
  topological:    { renderer: 'graph', category: 'Graph Algorithms' },
  bellman_ford:   { renderer: 'graph', category: 'Graph Algorithms' },

  // Array renderer
  quicksort:      { renderer: 'array', category: 'Sorting' },
  mergesort:      { renderer: 'array', category: 'Sorting' },
  heapsort:       { renderer: 'array', category: 'Sorting', secondaryRenderer: 'tree' },
  insertion_sort: { renderer: 'array', category: 'Sorting' },
  selection_sort: { renderer: 'array', category: 'Sorting' },
  bubble_sort:    { renderer: 'array', category: 'Sorting' },
  binary_search:  { renderer: 'array', category: 'Searching' },
  two_pointer:    { renderer: 'array', category: 'Techniques' },
  sliding_window: { renderer: 'array', category: 'Techniques' },

  // Table renderer
  knapsack:       { renderer: 'table', category: 'Dynamic Programming' },
  lcs:            { renderer: 'table', category: 'Dynamic Programming' },
  edit_distance:  { renderer: 'table', category: 'Dynamic Programming' },
  coin_change:    { renderer: 'table', category: 'Dynamic Programming' },
  matrix_chain:   { renderer: 'table', category: 'Dynamic Programming' },

  // Tree renderer
  bst_insert:     { renderer: 'tree', category: 'Trees' },
  bst_delete:     { renderer: 'tree', category: 'Trees' },
  avl_insert:     { renderer: 'tree', category: 'Trees' },
  red_black:      { renderer: 'tree', category: 'Trees' },
  heap_insert:    { renderer: 'tree', category: 'Trees' },
  heap_extract:   { renderer: 'tree', category: 'Trees' },

  // Linked structure renderer
  linked_list_reversal: { renderer: 'linked', category: 'Linked Structures' },
  stack_operations:     { renderer: 'linked', category: 'Linked Structures' },
  queue_operations:     { renderer: 'linked', category: 'Linked Structures' },
};
```

### 1.2 Create Client-Side Renderer Registry

Create `client/src/lib/rendererRegistry.js`:

```javascript
/**
 * Central routing layer. Takes a viz action with a `renderer` field
 * and dispatches it to the correct renderer's apply function.
 *
 * Each renderer registers itself with:
 *   registerRenderer('graph', { apply, takeSnapshot, restoreSnapshot, cleanup })
 */
const renderers = {};

export function registerRenderer(name, handler) {
  renderers[name] = handler;
}

export function applyAction(action) {
  const renderer = renderers[action.renderer];
  if (!renderer) {
    console.warn(`No renderer registered for: ${action.renderer}`);
    return;
  }
  renderer.apply(action.action, action.params);
}

export function applyActions(actions) {
  for (const action of actions) {
    applyAction(action);
  }
}

export function takeSnapshot(rendererName) {
  return renderers[rendererName]?.takeSnapshot?.();
}

export function restoreSnapshot(rendererName, snapshot) {
  renderers[rendererName]?.restoreSnapshot?.(snapshot);
}
```

### 1.3 Refactor GraphView → GraphRenderer

Rename `client/src/components/GraphView.jsx` to `client/src/components/renderers/GraphRenderer.jsx`.

- Extract all Cytoscape-specific logic into a self-contained renderer
- On mount, register itself with the renderer registry
- Existing viz actions (highlight_node, etc.) still work but are now routed through the registry
- The component receives a `rendererId` prop (default: 'graph')
- **Keep all existing Cytoscape styles, snapshot logic, overlay/ghost/rewind support intact**

```jsx
// On mount:
useEffect(() => {
  registerRenderer('graph', {
    apply: (action, params) => applyGraphAction(cyRef.current, action, params),
    takeSnapshot: () => takeGraphSnapshot(cyRef.current),
    restoreSnapshot: (snap) => restoreGraphSnapshot(cyRef.current, snap),
    cleanup: () => { /* remove ghost elements, overlays */ }
  });
  return () => unregisterRenderer('graph');
}, []);
```

### 1.4 Create VizLayout Component

Create `client/src/components/VizLayout.jsx`:

This manages which renderer panels are active and their layout (single panel, side-by-side for heapsort, etc.).

```jsx
/**
 * Props:
 *   panels: [{ id, renderer, props }]  — which renderers to show
 *
 * Layout rules:
 *   - 1 panel: full width
 *   - 2 panels: side by side (60/40 or 50/50)
 *   - 3+ panels: grid
 */
export default function VizLayout({ panels }) {
  return (
    <div className={layoutClass}>
      {panels.map(panel => (
        <RendererSwitch key={panel.id} type={panel.renderer} {...panel.props} />
      ))}
    </div>
  );
}

function RendererSwitch({ type, ...props }) {
  switch (type) {
    case 'graph': return <GraphRenderer {...props} />;
    case 'array': return <ArrayRenderer {...props} />;
    case 'table': return <TableRenderer {...props} />;
    case 'tree':  return <TreeRenderer {...props} />;
    case 'linked': return <LinkedRenderer {...props} />;
    default: return <div>Unknown renderer: {type}</div>;
  }
}
```

### 1.5 Update App.jsx

Replace direct `<GraphView>` usage with `<VizLayout>`. The panels array comes from state (set when `create_visualization` tool is called).

### 1.6 Backward-Compatible Viz Action Translation

In `useTutorState.js`, add a migration layer so existing graph viz actions (without a `renderer` field) are automatically wrapped:

```javascript
function normalizeVizActions(actions) {
  if (!actions) return [];
  return actions.map(a => {
    if (a.renderer) return a; // already new format
    // Legacy format — wrap for graph renderer
    return { renderer: 'graph', action: a.action, params: { ...a } };
  });
}
```

### 1.7 Verification

After Phase 1, run the existing Dijkstra/BFS/DFS lessons. They must work identically to before — same visuals, same interrupts, same explanation modes. The only difference is the actions now flow through the renderer registry.

---

## PHASE 2: Array Renderer & Sorting Algorithms

**Goal:** Build the array visualization renderer and add sorting algorithm trace generators. This is the highest-value addition — it covers quicksort, mergesort, insertion sort, selection sort, bubble sort, binary search, two-pointer, and sliding window.

### 2.1 Build ArrayRenderer Component

Create `client/src/components/renderers/ArrayRenderer.jsx`:

Visual design:
- Array displayed as horizontal bar chart (bars) or horizontal cells (for small arrays)
- Each element is a rounded rectangle with the value inside
- Index labels below each cell
- Color states: default (gray-700), comparing (yellow-400), swapping (blue-400), sorted (green-500), pivot (purple-500), pointer (red ring)
- CSS transitions on all color changes and position swaps (transform: translateX)
- Pointers shown as labeled arrows below the array (i, j, left, right, pivot, window_start, window_end)

Supported actions:
```
set_data({ values: [5, 3, 8, 1, 9], labels?: ['a','b','c','d','e'] })
highlight({ indices: [2, 5], className: 'comparing' })
swap({ i: 3, j: 7 })                          // animate the swap
compare({ i: 3, j: 7, result: 'less' })       // highlight pair being compared
partition({ pivot_index: 4, left: 0, right: 8 })
mark_sorted({ indices: [0, 1, 2] })           // these positions are finalized
set_pointer({ name: 'i', index: 3 })
clear_pointers()
slide_window({ start: 2, end: 5 })            // highlight window range
set_label({ index: 3, label: 'pivot' })
reset()
```

Implementation notes:
- Use React state for the array data, NOT D3 DOM manipulation. D3 is only needed if you want physics-based animations — React + CSS transitions are sufficient and simpler.
- Swap animation: temporarily render both elements with transform animations, then update the data array after the animation completes (use onTransitionEnd or a 300ms timeout).
- Register with the renderer registry on mount.
- Support `takeSnapshot` (capture current array values + classes) and `restoreSnapshot` for explanation modes.

### 2.2 Create Sorting Trace Generators

Create `server/algorithms/sorting/` directory with individual files:

**`server/algorithms/sorting/quicksort.js`:**
```javascript
export function quicksort(arr) {
  const trace = [];
  const data = [...arr];

  trace.push({
    type: 'init',
    description: `Starting quicksort on array of ${data.length} elements`,
    array: [...data]
  });

  function partition(low, high) {
    const pivot = data[high];
    trace.push({
      type: 'select_pivot',
      pivot_index: high, pivot_value: pivot,
      range: [low, high],
      description: `Choose pivot: ${pivot} at index ${high}`
    });

    let i = low - 1;
    for (let j = low; j < high; j++) {
      trace.push({
        type: 'compare',
        indices: [j, high],
        values: [data[j], pivot],
        description: `Compare ${data[j]} with pivot ${pivot}`
      });

      if (data[j] <= pivot) {
        i++;
        if (i !== j) {
          trace.push({
            type: 'swap', i, j,
            values: [data[i], data[j]],
            description: `Swap ${data[i]} and ${data[j]}`
          });
          [data[i], data[j]] = [data[j], data[i]];
        }
      }
    }

    if (i + 1 !== high) {
      trace.push({
        type: 'swap', i: i + 1, j: high,
        values: [data[i + 1], data[high]],
        description: `Place pivot: swap ${data[i + 1]} and ${data[high]}`
      });
      [data[i + 1], data[high]] = [data[high], data[i + 1]];
    }

    trace.push({
      type: 'pivot_placed', index: i + 1,
      description: `Pivot ${pivot} is now at its final position ${i + 1}`,
      array: [...data]
    });

    return i + 1;
  }

  function qs(low, high) {
    if (low < high) {
      trace.push({
        type: 'recurse',
        range: [low, high],
        description: `Quicksort subarray [${low}..${high}]`
      });
      const pi = partition(low, high);
      qs(low, pi - 1);
      qs(pi + 1, high);
    } else if (low === high) {
      trace.push({
        type: 'mark_sorted', indices: [low],
        description: `Single element at index ${low} is sorted`
      });
    }
  }

  qs(0, data.length - 1);

  trace.push({
    type: 'result',
    array: [...data],
    description: 'Quicksort complete!'
  });

  return trace;
}
```

Similarly create: `mergesort.js`, `insertion_sort.js`, `selection_sort.js`, `bubble_sort.js`, `binary_search.js`.

Each trace generator follows the same contract:
- Takes input data (array, target for search, etc.)
- Returns an array of step objects
- Each step has `type`, `description`, and algorithm-specific fields
- Steps include enough info for Claude to narrate AND for the renderer to animate

### 2.3 Create Algorithm Registry

Create `server/algorithms/registry.js`:

```javascript
import { dijkstra, bfs, dfs } from './graph/index.js';
import { quicksort, mergesort, insertionSort, selectionSort, bubbleSort } from './sorting/index.js';
import { binarySearch } from './searching/index.js';

/**
 * Central algorithm registry. Each entry defines:
 * - run: function(input) → trace[]
 * - renderer: which client renderer to use
 * - defaultInput: sample data for demos
 * - inputSchema: what the run function expects
 */
export const ALGORITHMS = {
  dijkstra: {
    run: (input) => dijkstra(input.graph, input.source),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_GRAPH, source: 'A' },
  },
  bfs: {
    run: (input) => bfs(input.graph, input.source),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_GRAPH, source: 'A' },
  },
  dfs: {
    run: (input) => dfs(input.graph, input.source),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_GRAPH, source: 'A' },
  },
  quicksort: {
    run: (input) => quicksort(input.array),
    renderer: 'array',
    category: 'Sorting',
    defaultInput: { array: [38, 27, 43, 3, 9, 82, 10] },
  },
  mergesort: {
    run: (input) => mergesort(input.array),
    renderer: 'array',
    category: 'Sorting',
    defaultInput: { array: [38, 27, 43, 3, 9, 82, 10] },
  },
  binary_search: {
    run: (input) => binarySearch(input.array, input.target),
    renderer: 'array',
    category: 'Searching',
    defaultInput: { array: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], target: 23 },
  },
  // ... more entries added in later phases
};

export function runAlgorithm(algorithmId, input) {
  const algo = ALGORITHMS[algorithmId];
  if (!algo) throw new Error(`Unknown algorithm: ${algorithmId}`);
  const actualInput = { ...algo.defaultInput, ...input };
  return {
    trace: algo.run(actualInput),
    renderer: algo.renderer,
    input: actualInput,
  };
}
```

### 2.4 Update `server/tools.js` — Add `create_visualization` Tool

Add a new tool that Claude calls to set up the visualization panel(s) before teaching:

```javascript
{
  name: 'create_visualization',
  description: 'Set up the visualization panel(s) for the current lesson. Call this INSTEAD of create_graph for non-graph algorithms. For graph algorithms, you can still use create_graph (which implicitly creates a graph visualization).',
  input_schema: {
    type: 'object',
    properties: {
      panels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            renderer: { type: 'string', enum: ['graph', 'array', 'table', 'tree', 'linked'] },
            config: { type: 'object', description: 'Renderer-specific initial config' }
          },
          required: ['renderer']
        },
        description: 'Visualization panels to display. Usually one, but some algorithms need two (e.g., heapsort needs array + tree).'
      }
    },
    required: ['panels']
  }
}
```

### 2.5 Update `run_algorithm` Tool Schema

Expand the `algorithm` enum to include all registered algorithms. Also add an `input` property so Claude can pass array data, search targets, etc.:

```javascript
{
  name: 'run_algorithm',
  input_schema: {
    type: 'object',
    properties: {
      algorithm: {
        type: 'string',
        enum: Object.keys(ALGORITHMS),
        description: 'Algorithm to execute'
      },
      input: {
        type: 'object',
        description: 'Algorithm-specific input. For graph algorithms: { source: "A" }. For sorting: { array: [5,3,8,1] }. For search: { array: [...], target: 23 }. Omit to use default sample data.'
      }
    },
    required: ['algorithm']
  }
}
```

### 2.6 Update `emit_segment` Viz Actions Schema

Change the `viz_actions` items to the new format with `renderer` field:

```javascript
viz_actions: {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      renderer: { type: 'string', enum: ['graph', 'array', 'table', 'tree', 'linked'] },
      action: { type: 'string', description: 'Renderer-specific action name' },
      params: { type: 'object', description: 'Action parameters' }
    },
    required: ['renderer', 'action']
  }
}
```

### 2.7 Update Agent System Prompt

Extend `SYSTEM_PROMPT` in `agent.js` with sorting-specific guidance:

```
You teach algorithms using visualizations. You support multiple visualization types:

GRAPH ALGORITHMS (renderer: 'graph'):
  Use create_graph to set up the graph, then run_algorithm + emit_segment.
  Viz actions: highlight_node, highlight_edge, mark_visited, mark_current, set_label, etc.

SORTING ALGORITHMS (renderer: 'array'):
  Use create_visualization with renderer:'array'.
  Run the algorithm to get the trace, then narrate each step.
  Viz actions: set_data, highlight, swap, compare, partition, mark_sorted, set_pointer.
  When narrating swaps, always mention BOTH the values being swapped and WHY.
  When narrating comparisons, state the result and its implication.
  Mark elements as sorted when they reach their final position.

For ALL algorithms:
  1. Call create_visualization (or create_graph) first
  2. Give a brief intro (1-2 segments)
  3. Call run_algorithm to get the trace
  4. Narrate each step with viz_actions
  5. Summarize results
```

### 2.8 Update AlgoSelector.jsx

Replace hardcoded algorithm list with the full registry. Group by category:

```javascript
const ALGORITHM_GROUPS = [
  {
    category: 'Graph Algorithms',
    algorithms: [
      { id: 'dijkstra', name: "Dijkstra's Shortest Path", description: '...' },
      { id: 'bfs', name: 'Breadth-First Search', description: '...' },
      { id: 'dfs', name: 'Depth-First Search', description: '...' },
    ]
  },
  {
    category: 'Sorting',
    algorithms: [
      { id: 'quicksort', name: 'Quicksort', description: 'Divide and conquer with pivot partitioning' },
      { id: 'mergesort', name: 'Merge Sort', description: 'Divide and conquer with sorted merging' },
      { id: 'insertion_sort', name: 'Insertion Sort', description: 'Build sorted array one element at a time' },
      // ...
    ]
  },
  // ... more groups
];
```

### 2.9 Verification

- Select quicksort → array renderer appears with animated bars
- Claude narrates each compare/swap/partition step
- Interrupt with "why did we pick that pivot?" → overlay mode highlights the pivot
- Interrupt with "what just happened?" → rewind replays last few array operations
- Existing graph algorithms still work unchanged

---

## PHASE 3: DP Table Renderer

**Goal:** Build the table/matrix renderer for dynamic programming algorithms.

### 3.1 Build TableRenderer Component

Create `client/src/components/renderers/TableRenderer.jsx`:

Visual design:
- 2D grid of cells, each showing a numeric value
- Row and column headers (customizable labels)
- Color states: empty (gray-800), filling (blue-400 pulse), filled (gray-600), highlighted (yellow-400), optimal_path (green-500)
- Dependency arrows: SVG arrows drawn from source cells to the current cell being filled
- Current cell has a bright border + glow effect
- Smooth fill animation (value fades in, background transitions)

Supported actions:
```
init_grid({ rows: 5, cols: 7, row_headers: [...], col_headers: [...] })
fill_cell({ row: 2, col: 3, value: 5, className?: 'optimal' })
highlight_cell({ row: 2, col: 3, className: 'current' })
highlight_row({ row: 2 })
highlight_col({ col: 3 })
show_dependency_arrow({ from: {row:1, col:2}, to: {row:2, col:3} })
set_row_header({ row: 2, label: 'item 2 (w=3, v=4)' })
set_col_header({ col: 5, label: 'capacity=5' })
mark_optimal({ cells: [{row:1,col:2}, {row:2,col:3}] })  // trace back optimal solution
reset()
```

### 3.2 Create DP Trace Generators

Create `server/algorithms/dp/`:

**`knapsack.js`** — 0/1 Knapsack with full table trace
**`lcs.js`** — Longest Common Subsequence
**`edit_distance.js`** — Levenshtein distance
**`coin_change.js`** — Minimum coins

Each generator produces a trace with steps like:
```javascript
{ type: 'init_table', rows: 4, cols: 8, description: '...' }
{ type: 'consider_item', item: { weight: 3, value: 4 }, row: 2, description: '...' }
{ type: 'fill_cell', row: 2, col: 5, value: 7, from: [{row:1, col:2}], description: 'Take item 2: dp[1][2] + value(4) = 7' }
{ type: 'skip_cell', row: 2, col: 1, value: 3, reason: 'Item too heavy', description: '...' }
{ type: 'traceback', cells: [...], description: 'Optimal solution uses items 1 and 3' }
```

### 3.3 Register DP Algorithms

Add to `server/algorithms/registry.js`:
```javascript
knapsack: {
  run: (input) => knapsack(input.items, input.capacity),
  renderer: 'table',
  category: 'Dynamic Programming',
  defaultInput: {
    items: [
      { name: 'Laptop', weight: 3, value: 4 },
      { name: 'Guitar', weight: 1, value: 1 },
      { name: 'Turntable', weight: 4, value: 5 },
      { name: 'iPhone', weight: 2, value: 3 },
    ],
    capacity: 7
  }
}
```

### 3.4 Update System Prompt for DP

```
DYNAMIC PROGRAMMING ALGORITHMS (renderer: 'table'):
  Use create_visualization with renderer:'table'.
  The key teaching strategy for DP:
  1. Explain the subproblem structure first (what does dp[i][j] mean?)
  2. Show the recurrence relation
  3. Fill the table cell by cell, explaining the choice at each step
  4. Use show_dependency_arrow to visualize which cells feed into the current one
  5. At the end, do a traceback to show the optimal solution path

  When narrating, always state: "We're asking: [subproblem in plain English]"
  For each cell, say whether we're taking/skipping the item (knapsack),
  matching/inserting/deleting (edit distance), etc.
```

### 3.5 Verification

- Select knapsack → table renderer appears
- Claude fills cells one by one with dependency arrows
- Interrupt with "why did we pick that value?" → overlay highlights the source cells
- Interrupt with "what if we included item 2 here?" → ghost alternative shows the different table path

---

## PHASE 4: Extend Graph Renderer — MST & Undirected

**Goal:** Add Kruskal's and Prim's algorithms with undirected graph support.

### 4.1 Add Undirected Mode to GraphRenderer

- New viz action: `set_undirected()` — removes arrowheads, renders edges as lines
- New viz action: `highlight_component({ nodes: ['A','B','C'], color: '#3b82f6' })` — color-code connected components for Union-Find visualization in Kruskal's
- New viz action: `mark_mst_edge({ from, to })` — thicker green edge style for MST edges
- New viz action: `strikethrough_edge({ from, to })` — dashed + red for rejected edges

### 4.2 Create MST Trace Generators

**`server/algorithms/graph/kruskal.js`:**
- Trace types: `sort_edges`, `consider_edge`, `check_cycle` (with Union-Find state), `add_to_mst`, `reject_edge`, `result`

**`server/algorithms/graph/prim.js`:**
- Similar to Dijkstra trace but MST-specific: `init`, `visit_node`, `consider_edge`, `add_to_mst`, `update_key`, `result`

### 4.3 Add Undirected Default Graph

```javascript
export const DEFAULT_UNDIRECTED_GRAPH = {
  nodes: [
    { id: 'A' }, { id: 'B' }, { id: 'C' },
    { id: 'D' }, { id: 'E' }, { id: 'F' }
  ],
  edges: [
    { source: 'A', target: 'B', weight: 4 },
    { source: 'A', target: 'C', weight: 2 },
    { source: 'B', target: 'C', weight: 1 },
    { source: 'B', target: 'D', weight: 5 },
    { source: 'C', target: 'D', weight: 8 },
    { source: 'C', target: 'E', weight: 10 },
    { source: 'D', target: 'E', weight: 2 },
    { source: 'D', target: 'F', weight: 6 },
    { source: 'E', target: 'F', weight: 3 },
  ],
  directed: false,
  positions: { A: {x:100,y:200}, B: {x:300,y:100}, C: {x:300,y:300}, D: {x:500,y:100}, E: {x:500,y:300}, F: {x:700,y:200} }
};
```

### 4.4 Verification

- Kruskal's shows edges being sorted, then considered one by one
- Components color-coded as they merge
- MST edges rendered prominently, rejected edges struck through
- Prim's works similarly to Dijkstra visually but builds MST

---

## PHASE 5: Tree Renderer

**Goal:** Build the tree visualization renderer for BST, AVL, heap operations.

### 5.1 Build TreeRenderer Component

Create `client/src/components/renderers/TreeRenderer.jsx`:

Use D3's tree layout (`d3.tree()`) for automatic positioning. This is better than Cytoscape for trees because D3's tree layout handles structural changes (insertions, deletions, rotations) with smooth transitions.

Visual design:
- Nodes as circles with values, connected by curved edges
- D3 tree layout auto-positions everything
- Color states: default (gray), current (blue), comparing (yellow), inserted (green), deleted (red with fade), rotated (purple flash)
- For AVL/red-black: node color indicator (red/black dot or ring)
- For heaps: array index label below each node + array representation at bottom

Supported actions:
```
set_tree({ nodes: [...], edges: [...], root: 'id' })
highlight_node({ id, className })
highlight_edge({ from, to, className })
insert_node({ id, value, parent, side: 'left'|'right' })  // animate insertion
delete_node({ id })                                         // animate removal + restructure
rotate_left({ pivot: 'id' })                                // animate rotation
rotate_right({ pivot: 'id' })
recolor_node({ id, color: 'red'|'black' })                 // for red-black trees
sift_up({ id })                                             // heap: animate bubble up
sift_down({ id })                                           // heap: animate bubble down
mark_level({ level: 2 })                                    // highlight entire level
reset()
```

Key implementation detail: Use D3 transitions for smooth structural changes. When a node is inserted or a rotation happens, D3's tree layout recalculates positions and transitions animate nodes from old to new positions. This is the core visual payoff of the tree renderer.

### 5.2 Create Tree Trace Generators

**`server/algorithms/tree/bst_insert.js`** — trace BST insertion path
**`server/algorithms/tree/avl_insert.js`** — BST insert + rotation detection + rebalancing
**`server/algorithms/tree/heap_operations.js`** — insert (sift up) and extract-min (sift down)

### 5.3 Verification

- BST insert shows path traversal then node placement
- AVL insert shows imbalance detection then rotation animation
- Heap operations show array + tree side by side (dual panel via VizLayout)

---

## PHASE 6: Meta-Prompted Trace Generation (Author Agent)

**Goal:** Add the ability to generate trace generators on-the-fly for algorithms not in the hand-written registry. This is the "Tier 2" of the hybrid system.

### 6.1 Create Author Agent

Create `server/authorAgent.js`:

```javascript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

const AUTHOR_SYSTEM_PROMPT = `You write algorithm trace generators in JavaScript.

Given an algorithm name and a target renderer type, produce a JavaScript function
that ACTUALLY EXECUTES the algorithm and returns a step-by-step trace array.

Function signature: function run(input) → trace[]

Each trace step must have:
- type: string (action category, e.g., 'compare', 'swap', 'visit_node')
- description: string (human-readable explanation of this step)
- Additional fields specific to the step type

The function must CORRECTLY implement the algorithm. Use proper data structures.
Do not simulate or approximate.

RENDERER-SPECIFIC STEP TYPES:

For renderer 'graph':
  Steps should include: init, visit_node, examine_edge, relax/update, result
  Each step should have: { node?, from?, to?, weight?, distances?, visited? }

For renderer 'array':
  Steps should include: init, compare, swap, partition, mark_sorted, result
  Each step should have: { indices?, values?, array? (snapshot) }

For renderer 'table':
  Steps should include: init_table, fill_cell, skip_cell, traceback, result
  Each step should have: { row?, col?, value?, from? (dependency cells) }

For renderer 'tree':
  Steps should include: init, traverse, insert, rotate, recolor, result
  Each step should have: { node?, parent?, side?, direction? }

Output ONLY the function body wrapped in: \`\`\`javascript ... \`\`\`
No explanation. No imports. Pure function.`;

/**
 * Generate a trace generator function for an algorithm.
 * Returns the function as a string, ready to be eval'd in a sandbox.
 */
export async function generateTraceGenerator(algorithmName, renderer, description) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: AUTHOR_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Write a trace generator for: ${algorithmName}
Target renderer: ${renderer}
Description: ${description || algorithmName}
Input format: The function receives an object with algorithm-specific fields.`
    }],
  });

  const text = response.content[0].text;
  const match = text.match(/```javascript\n([\s\S]*?)```/);
  if (!match) throw new Error('Author agent did not produce valid code');

  return match[1].trim();
}
```

### 6.2 Create Sandboxed Executor

Create `server/algorithms/sandbox.js`:

```javascript
import { createContext, runInContext } from 'vm';

/**
 * Execute a generated trace function in a sandboxed VM context.
 * No access to require, process, fs, etc.
 */
export function executeTraceInSandbox(functionCode, input, timeoutMs = 5000) {
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    Math, Array, Object, Map, Set, JSON,
    Infinity, NaN, undefined, null,
    parseInt, parseFloat, isNaN, isFinite,
  };

  const wrappedCode = `
    const run = ${functionCode.startsWith('function') ? functionCode : `function run(input) { ${functionCode} }`};
    run(input);
  `;

  const context = createContext({ ...sandbox, input });
  const trace = runInContext(wrappedCode, context, { timeout: timeoutMs });

  // Validate trace structure
  if (!Array.isArray(trace)) throw new Error('Trace generator did not return an array');
  for (const step of trace) {
    if (!step.type || !step.description) {
      throw new Error('Trace step missing required fields: type, description');
    }
  }

  return trace;
}
```

### 6.3 Create Trace Cache

Create `server/algorithms/cache.js`:

```javascript
/**
 * Cache generated trace generators to avoid regenerating them.
 * In production, this would be Redis or a database.
 * For now, in-memory Map + optional file-system persistence.
 */
const cache = new Map();

export function getCachedGenerator(algorithmId) {
  return cache.get(algorithmId);
}

export function cacheGenerator(algorithmId, { code, renderer, verifiedAt }) {
  cache.set(algorithmId, { code, renderer, verifiedAt, hitCount: 0 });
}

export function incrementHitCount(algorithmId) {
  const entry = cache.get(algorithmId);
  if (entry) entry.hitCount++;
}
```

### 6.4 Integrate into Algorithm Registry

Update `server/algorithms/registry.js` to fall back to the author agent when an algorithm isn't in the hand-written registry:

```javascript
export async function runAlgorithmWithFallback(algorithmId, input) {
  // Tier 1: Hand-written trace generator
  if (ALGORITHMS[algorithmId]) {
    return { ...ALGORITHMS[algorithmId].run(input), tier: 1 };
  }

  // Tier 2: Cached generated trace
  const cached = getCachedGenerator(algorithmId);
  if (cached) {
    incrementHitCount(algorithmId);
    const trace = executeTraceInSandbox(cached.code, input);
    return { trace, renderer: cached.renderer, tier: 2 };
  }

  // Tier 2: Generate new trace generator
  const renderer = guessRenderer(algorithmId);  // heuristic or ask Claude
  const code = await generateTraceGenerator(algorithmId, renderer);
  const trace = executeTraceInSandbox(code, input);

  // Verify against test case before caching
  // (basic verification: trace is non-empty, has init and result steps)
  if (trace.length >= 2 && trace[0].type === 'init') {
    cacheGenerator(algorithmId, { code, renderer, verifiedAt: Date.now() });
  }

  return { trace, renderer, tier: 2 };
}
```

### 6.5 Update Agent to Handle Unknown Algorithms

When a student selects an algorithm not in the hard-coded list (or types a custom one), the system:
1. Checks the registry (Tier 1)
2. Checks the cache (Tier 2 cached)
3. Generates via author agent (Tier 2 new) — show "Preparing lesson..." to student
4. Falls back to Tier 3 (imperative, Claude drives directly) if generation fails

### 6.6 Verification

- Request "Bellman-Ford" (not in Tier 1) → author agent generates it, caches it
- Second request for Bellman-Ford → uses cache, instant
- Generated trace produces correct results
- Sandbox prevents malicious code execution

---

## PHASE 7: Linked Structure Renderer

**Goal:** Build the linked list/stack/queue renderer for pointer-based data structures.

### 7.1 Build LinkedRenderer Component

Create `client/src/components/renderers/LinkedRenderer.jsx`:

Visual design:
- Horizontal chain of rounded rectangles connected by arrows
- Each node shows value + (optionally) a "next" pointer arrow
- Stack: vertical chain (top to bottom)
- Queue: horizontal with "front" and "rear" labels
- Animations: node slides in from above on insert, slides out + fades on delete, pointer arrow animates to new target on reversal

Supported actions: `set_list`, `highlight_node`, `insert_after`, `delete_node`, `reverse_segment`, `push`, `pop`, `enqueue`, `dequeue`, `set_pointer`, `reset`

### 7.2 Trace Generators

`server/algorithms/linked/reversal.js` — linked list reversal (prev/current/next pointer manipulation)
`server/algorithms/linked/stack_operations.js` — push/pop sequences
`server/algorithms/linked/queue_operations.js` — enqueue/dequeue sequences

---

## PHASE 8: Polish & Production Hardening

### 8.1 Error Boundaries

Wrap each renderer in a React error boundary so one renderer crashing doesn't kill the whole app.

### 8.2 Explanation Mode Support for All Renderers

Ensure overlay, rewind, and ghost_alternative work for every renderer, not just graph:

- **Array overlay:** dim non-relevant indices, spotlight the comparison/swap being discussed
- **Array rewind:** restore array to state N steps ago, replay
- **Table overlay:** spotlight specific cells and their dependency arrows
- **Tree ghost:** show the alternative rotation or insertion path as ghost nodes

Each renderer's `takeSnapshot` / `restoreSnapshot` must be thorough enough to power these.

### 8.3 Responsive Layout

VizLayout should handle:
- Mobile: single column, viz panel stacks above transcript
- Desktop: side-by-side (current layout)
- Dual-panel algorithms (heapsort): stacked renderers in the viz area

### 8.4 Algorithm Input Customization

Let students provide custom inputs:
- Custom arrays for sorting ("sort [5, 2, 8, 1, 9]")
- Custom graphs (simple adjacency list input)
- Custom DP parameters (knapsack items, capacity)

The agent parses natural language requests and passes appropriate input to `run_algorithm`.

### 8.5 Performance Optimizations

- Debounce rapid viz actions (don't re-render for every single action in a batch)
- Lazy-load renderer components (React.lazy + Suspense)
- Limit WebSocket message queue size
- Cap trace length (if an algorithm produces 500+ steps, auto-summarize middle sections)

### 8.6 Testing

Create test files for:
- Every trace generator: verify trace structure, final result correctness
- Renderer registry: verify action routing
- Sandbox: verify timeout, no access to globals
- Snapshot/restore: verify round-trip fidelity for each renderer

---

## File Structure (Final)

```
algo-tutor/
├── shared/
│   └── vizProtocol.js                # Renderer actions, algorithm→renderer mapping
├── server/
│   ├── index.js                      # Express + WS server (minimal changes)
│   ├── agent.js                      # Claude agent loop (updated system prompt)
│   ├── authorAgent.js                # Tier 2 meta-prompted code generation
│   ├── tools.js                      # Tool schemas (expanded)
│   ├── tts.js                        # ElevenLabs TTS (unchanged)
│   └── algorithms/
│       ├── registry.js               # Central algorithm registry + fallback
│       ├── sandbox.js                # VM sandbox for generated code
│       ├── cache.js                  # Generated trace generator cache
│       ├── graph/
│       │   ├── index.js
│       │   ├── dijkstra.js           # (extracted from algorithms.js)
│       │   ├── bfs.js
│       │   ├── dfs.js
│       │   ├── kruskal.js
│       │   └── prim.js
│       ├── sorting/
│       │   ├── index.js
│       │   ├── quicksort.js
│       │   ├── mergesort.js
│       │   ├── insertionSort.js
│       │   ├── selectionSort.js
│       │   └── bubbleSort.js
│       ├── searching/
│       │   ├── index.js
│       │   └── binarySearch.js
│       ├── dp/
│       │   ├── index.js
│       │   ├── knapsack.js
│       │   ├── lcs.js
│       │   ├── editDistance.js
│       │   └── coinChange.js
│       ├── tree/
│       │   ├── index.js
│       │   ├── bstInsert.js
│       │   ├── avlInsert.js
│       │   └── heapOperations.js
│       └── linked/
│           ├── index.js
│           ├── reversal.js
│           ├── stackOperations.js
│           └── queueOperations.js
├── client/
│   ├── src/
│   │   ├── App.jsx                   # Updated: uses VizLayout
│   │   ├── components/
│   │   │   ├── AlgoSelector.jsx      # Updated: grouped by category
│   │   │   ├── Controls.jsx          # Minor updates
│   │   │   ├── Transcript.jsx        # Unchanged
│   │   │   ├── VizLayout.jsx         # NEW: manages renderer panels
│   │   │   └── renderers/
│   │   │       ├── GraphRenderer.jsx  # Refactored from GraphView.jsx
│   │   │       ├── ArrayRenderer.jsx  # NEW
│   │   │       ├── TableRenderer.jsx  # NEW
│   │   │       ├── TreeRenderer.jsx   # NEW
│   │   │       └── LinkedRenderer.jsx # NEW
│   │   ├── hooks/
│   │   │   ├── useTutorState.js      # Updated: multi-renderer state
│   │   │   ├── useWebSocket.js       # Unchanged
│   │   │   ├── useAudioPlayer.js     # Unchanged
│   │   │   └── useSpeechToText.js    # Unchanged
│   │   └── lib/
│   │       ├── rendererRegistry.js   # NEW: action routing
│   │       └── vizActions.js         # Refactored: graph-specific helpers
│   └── ...
└── package.json
```

---

## Implementation Order Summary

| Phase | What | Effort | Coverage Added |
|-------|------|--------|----------------|
| 1 | Renderer registry + refactor | Medium | 0 new algos (foundation) |
| 2 | Array renderer + sorting | Large | +6 sorting + binary search |
| 3 | DP table renderer | Medium | +4 DP algorithms |
| 4 | Graph MST + undirected | Small | +2 MST algorithms |
| 5 | Tree renderer | Medium | +4 tree algorithms |
| 6 | Author agent (meta-prompting) | Medium | +unlimited (Tier 2) |
| 7 | Linked structure renderer | Small | +3 linked structure demos |
| 8 | Polish + production hardening | Medium | Robustness |

**Total hand-written algorithms: ~20**
**Total with author agent: unlimited**
**Estimated course coverage: 90%+ of a typical undergrad algorithms class**

---

## Critical Rules for All Phases

1. **Never break existing functionality.** Every phase must leave Dijkstra/BFS/DFS working. Run them after every phase as a regression check.

2. **Trace generators must be correct.** Write unit tests for every trace generator that verify the final result (sorted array, shortest distances, correct DP table values). Educational tools cannot teach wrong results.

3. **Each renderer must support snapshot/restore.** This powers the explanation system. If a renderer can't snapshot, the overlay/rewind/ghost modes won't work for algorithms using that renderer.

4. **Keep the agent's tool interface clean.** Claude performs better with fewer, well-typed tools than many generic ones. Each tool should have clear, specific documentation.

5. **The viz protocol is the contract.** If you change the action format, update both the server (tool schemas + system prompt) and client (renderer registry + renderer components) in the same commit.

6. **Install new client dependencies as needed:**
   - D3 (`npm install d3`) — for tree renderer layout and transitions
   - No other major dependencies expected; array/table/linked renderers are pure React + CSS

7. **Server-side `algorithms.js` should be split** into the directory structure in Phase 2. The existing `DEFAULT_GRAPH`, `dijkstra`, `bfs`, `dfs` functions move to `server/algorithms/graph/`. The old `algorithms.js` becomes a thin re-export for backward compat until Phase 2 is fully wired.
