// Renderer manifest — single source of truth for all renderer actions, classNames, and docs.
// Used by guidedAgent.js to provide dynamic renderer documentation to the LLM.

export const RENDERER_MANIFEST = {
  graph: {
    actions: [
      { name: 'highlight_node', params: { node: 'string', className: 'string?' }, description: 'Add a CSS class to a node' },
      { name: 'highlight_edge', params: { from: 'string', to: 'string', className: 'string?' }, description: 'Add a CSS class to an edge' },
      { name: 'mark_visited', params: { node: 'string' }, description: 'Mark node as visited (removes current class)' },
      { name: 'mark_current', params: { node: 'string' }, description: 'Mark node as current (removes current from all others)' },
      { name: 'set_label', params: { node: 'string', label: 'string' }, description: 'Set a node\'s display label' },
      { name: 'reset_highlights', params: {}, description: 'Remove all highlight classes from all elements' },
      { name: 'show_path', params: { path: 'string[]' }, description: 'Highlight a sequence of nodes and connecting edges as a path' },
      { name: 'update_edge_label', params: { from: 'string', to: 'string', label: 'string' }, description: 'Update the weight/label displayed on an edge' },
    ],
    classNames: [
      { name: 'highlighted', color: 'gold/amber' },
      { name: 'current', color: 'blue' },
      { name: 'visited', color: 'green' },
      { name: 'path', color: 'purple' },
      { name: 'examining', color: 'orange' },
    ],
    setup: 'create_visualization({ panels: [], context_panels: [...] })  // graph is set up via update_graph',
    example: `emit_segment({
  narration: "Notice edge s→a has capacity 2...",
  viz_actions: [
    { renderer: "graph", action: "highlight_edge", params: { from: "s", to: "a", className: "highlighted" } },
    { renderer: "graph", action: "highlight_node", params: { node: "s", className: "current" } }
  ]
})`,
  },

  array: {
    actions: [
      { name: 'set_data', params: { values: 'number[]', labels: 'string[]?' }, description: 'Initialize array with values and optional labels' },
      { name: 'highlight', params: { indices: 'number[]', className: 'string?' }, description: 'Highlight elements at given indices' },
      { name: 'swap', params: { i: 'number', j: 'number' }, description: 'Swap two elements with animation' },
      { name: 'compare', params: { i: 'number', j: 'number' }, description: 'Highlight two elements as being compared' },
      { name: 'partition', params: { pivot_index: 'number', left: 'number', right: 'number' }, description: 'Show partition boundaries around a pivot' },
      { name: 'place', params: { index: 'number', value: 'any' }, description: 'Place a value at an index' },
      { name: 'mark_sorted', params: { indices: 'number[]' }, description: 'Mark elements as sorted (green)' },
      { name: 'set_pointer', params: { name: 'string', index: 'number' }, description: 'Show a named pointer at an index' },
      { name: 'clear_pointers', params: {}, description: 'Remove all pointers' },
      { name: 'slide_window', params: { start: 'number', end: 'number' }, description: 'Highlight a sliding window range' },
      { name: 'set_label', params: { index: 'number', label: 'string' }, description: 'Set a custom label for an element' },
      { name: 'reset', params: {}, description: 'Reset all highlights and pointers' },
    ],
    classNames: [
      { name: 'comparing', color: 'yellow' },
      { name: 'swapping', color: 'blue' },
      { name: 'sorted', color: 'green' },
      { name: 'pivot', color: 'purple' },
      { name: 'active', color: 'blue' },
      { name: 'window', color: 'cyan' },
    ],
    setup: 'create_visualization({ panels: [{ renderer: "array" }], context_panels: [...] })',
    example: `emit_segment({
  narration: "Let's start with the unsorted array...",
  viz_actions: [
    { renderer: "array", action: "set_data", params: { values: [5, 3, 8, 1, 2] } },
    { renderer: "array", action: "highlight", params: { indices: [0, 1], className: "comparing" } }
  ]
})`,
  },

  table: {
    actions: [
      { name: 'init_grid', params: { rows: 'number', cols: 'number', row_headers: 'string[]?', col_headers: 'string[]?' }, description: 'Initialize an empty grid with optional headers' },
      { name: 'fill_cell', params: { row: 'number', col: 'number', value: 'any', className: 'string?' }, description: 'Set a cell value' },
      { name: 'highlight_cell', params: { row: 'number', col: 'number', className: 'string?' }, description: 'Highlight a specific cell' },
      { name: 'highlight_row', params: { row: 'number' }, description: 'Highlight an entire row' },
      { name: 'highlight_col', params: { col: 'number' }, description: 'Highlight an entire column' },
      { name: 'show_dependency_arrow', params: { from: '{row,col}', to: '{row,col}', role: 'string' }, description: 'Draw an arrow between cells showing a dependency' },
      { name: 'clear_dependency_arrows', params: {}, description: 'Remove all dependency arrows' },
      { name: 'set_row_header', params: { row: 'number', label: 'string' }, description: 'Update a row header label' },
      { name: 'set_col_header', params: { col: 'number', label: 'string' }, description: 'Update a column header label' },
      { name: 'mark_optimal', params: { cells: '{row,col}[]' }, description: 'Mark cells as part of the optimal solution (green)' },
      { name: 'reset', params: {}, description: 'Clear all cells and highlights' },
    ],
    classNames: [
      { name: 'filled', color: 'gray (default)' },
      { name: 'current', color: 'blue' },
      { name: 'highlighted', color: 'gold' },
      { name: 'optimal', color: 'green' },
    ],
    setup: 'create_visualization({ panels: [{ renderer: "table" }], context_panels: [...] })',
    example: `emit_segment({
  narration: "Let me set up the DP table...",
  viz_actions: [
    { renderer: "table", action: "init_grid", params: { rows: 4, cols: 5, row_headers: ["0","1","2","3"], col_headers: ["0","1","2","3","4"] } },
    { renderer: "table", action: "fill_cell", params: { row: 0, col: 0, value: "0" } }
  ]
})`,
  },

  tree: {
    actions: [
      { name: 'set_tree', params: { nodes: 'array', edges: 'array', root: 'string', heap_array: 'number[]?' }, description: 'Initialize tree with nodes, edges, and root' },
      { name: 'highlight_node', params: { id: 'string', className: 'string?' }, description: 'Highlight a tree node' },
      { name: 'highlight_edge', params: { from: 'string', to: 'string', className: 'string?' }, description: 'Highlight a tree edge' },
      { name: 'insert_node', params: { id: 'string', value: 'any', parent: 'string?', side: "'left'|'right'?" }, description: 'Insert a new node' },
      { name: 'delete_node', params: { id: 'string' }, description: 'Delete a node from the tree' },
      { name: 'rotate_left', params: { pivot: 'string' }, description: 'Left rotation around pivot' },
      { name: 'rotate_right', params: { pivot: 'string' }, description: 'Right rotation around pivot' },
      { name: 'recolor_node', params: { id: 'string', color: "'red'|'black'" }, description: 'Change node color (for red-black trees)' },
      { name: 'sift_up', params: { id: 'string' }, description: 'Animate sift-up operation (heaps)' },
      { name: 'sift_down', params: { id: 'string' }, description: 'Animate sift-down operation (heaps)' },
      { name: 'mark_level', params: { level: 'number' }, description: 'Highlight all nodes at a given depth level' },
      { name: 'update_heap_array', params: { array: 'number[]' }, description: 'Update the heap array display' },
      { name: 'reset', params: {}, description: 'Reset all highlights' },
    ],
    classNames: [
      { name: 'current', color: 'blue' },
      { name: 'comparing', color: 'yellow' },
      { name: 'inserted', color: 'green' },
      { name: 'deleted', color: 'red' },
      { name: 'rotated', color: 'purple' },
      { name: 'highlighted', color: 'amber' },
      { name: 'sifting', color: 'cyan' },
    ],
    setup: 'create_visualization({ panels: [{ renderer: "tree" }], context_panels: [...] })',
    example: `emit_segment({
  narration: "Let's build the binary search tree...",
  viz_actions: [
    { renderer: "tree", action: "set_tree", params: { nodes: [{id:"10",value:10},{id:"5",value:5},{id:"15",value:15}], edges: [{from:"10",to:"5"},{from:"10",to:"15"}], root: "10" } },
    { renderer: "tree", action: "highlight_node", params: { id: "10", className: "current" } }
  ]
})`,
  },

  linked: {
    actions: [
      { name: 'set_list', params: { values: 'any[]', mode: "'list'|'stack'|'queue'?" }, description: 'Initialize linked list with values' },
      { name: 'highlight_node', params: { index: 'number?', value: 'any?', className: 'string?' }, description: 'Highlight a node by index or value' },
      { name: 'highlight_pointer', params: { name: 'string', index: 'number' }, description: 'Show a named pointer at a position' },
      { name: 'insert_after', params: { index: 'number', value: 'any' }, description: 'Insert a node after the given index' },
      { name: 'delete_node', params: { index: 'number' }, description: 'Delete the node at index' },
      { name: 'reverse_segment', params: { start: 'number', end: 'number' }, description: 'Reverse nodes between start and end indices' },
      { name: 'push', params: { value: 'any' }, description: 'Push value onto stack (prepend)' },
      { name: 'pop', params: {}, description: 'Pop from stack (remove head)' },
      { name: 'enqueue', params: { value: 'any' }, description: 'Enqueue value (append)' },
      { name: 'dequeue', params: {}, description: 'Dequeue (remove head)' },
      { name: 'set_pointer', params: { name: 'string', index: 'number' }, description: 'Set a named pointer at an index' },
      { name: 'reset', params: {}, description: 'Reset all highlights and pointers' },
    ],
    classNames: [
      { name: 'highlighted', color: 'yellow' },
      { name: 'current', color: 'blue' },
      { name: 'inserted', color: 'green' },
      { name: 'deleted', color: 'red' },
      { name: 'reversed', color: 'purple' },
    ],
    setup: 'create_visualization({ panels: [{ renderer: "linked" }], context_panels: [...] })',
    example: `emit_segment({
  narration: "Here's our linked list...",
  viz_actions: [
    { renderer: "linked", action: "set_list", params: { values: [1, 2, 3, 4, 5] } },
    { renderer: "linked", action: "highlight_node", params: { index: 0, className: "current" } }
  ]
})`,
  },

  interval: {
    actions: [
      { name: 'set_jobs', params: { jobs: '{id, name, start, end}[]' }, description: 'Initialize jobs with start/end times' },
      { name: 'set_machines', params: { count: 'number?', machines: 'string[]?' }, description: 'Create N machine rows (names auto-generated if count given)' },
      { name: 'assign_machine', params: { job_id: 'string', machine: 'number' }, description: 'Assign a job to a machine row (0-indexed)' },
      { name: 'highlight_job', params: { job_id: 'string', className: 'string?' }, description: 'Highlight a single job' },
      { name: 'highlight_jobs', params: { job_ids: 'string[]', className: 'string?' }, description: 'Highlight multiple jobs' },
      { name: 'highlight_overlap', params: { job1: 'string', job2: 'string' }, description: 'Show overlap conflict between two jobs (marks both red)' },
      { name: 'clear_overlaps', params: {}, description: 'Remove all overlap indicators' },
      { name: 'mark_sorted', params: { job_ids: 'string[]' }, description: 'Mark jobs as sorted (green)' },
      { name: 'mark_selected', params: { job_ids: 'string[]' }, description: 'Mark jobs as selected/accepted (green)' },
      { name: 'mark_rejected', params: { job_ids: 'string[]' }, description: 'Mark jobs as rejected (gray)' },
      { name: 'sweep_line', params: { time: 'number' }, description: 'Show vertical sweep line at time position' },
      { name: 'clear_sweep_line', params: {}, description: 'Remove sweep line' },
      { name: 'set_pointer', params: { name: 'string', job_id: 'string' }, description: 'Show a named label on a job' },
      { name: 'clear_pointers', params: {}, description: 'Remove all pointer labels' },
      { name: 'reset', params: {}, description: 'Clear all highlights, assignments, overlaps, and pointers' },
    ],
    classNames: [
      { name: 'current', color: 'yellow' },
      { name: 'selected', color: 'green' },
      { name: 'rejected', color: 'gray' },
      { name: 'overlap', color: 'red' },
      { name: 'comparing', color: 'yellow' },
      { name: 'assigned', color: 'cyan' },
      { name: 'sorted', color: 'green' },
    ],
    setup: 'create_visualization({ panels: [{ renderer: "interval" }], context_panels: [...] })',
    example: `emit_segment({
  narration: "We have 5 jobs. Let's sort them by end time and assign to machines...",
  viz_actions: [
    { renderer: "interval", action: "set_jobs", params: { jobs: [
      { id: "A", name: "Job A", start: 0, end: 3 },
      { id: "B", name: "Job B", start: 1, end: 4 },
      { id: "C", name: "Job C", start: 2, end: 6 },
      { id: "D", name: "Job D", start: 5, end: 8 },
      { id: "E", name: "Job E", start: 6, end: 9 }
    ] } },
    { renderer: "interval", action: "set_machines", params: { machines: ["M1", "M2", "M3"] } },
    { renderer: "interval", action: "assign_machine", params: { job_id: "A", machine: 0 } },
    { renderer: "interval", action: "highlight_job", params: { job_id: "A", className: "current" } },
    { renderer: "interval", action: "sweep_line", params: { time: 3 } }
  ]
})`,
  },
};

/**
 * Build formatted renderer documentation for one or more renderers.
 * @param {string[]} rendererTypes - Array of renderer names to document
 * @returns {string} Formatted documentation text
 */
export function buildRendererDocs(rendererTypes) {
  const sections = [];

  for (const type of rendererTypes) {
    const manifest = RENDERER_MANIFEST[type];
    if (!manifest) continue;

    const actionLines = manifest.actions.map((a) => {
      const paramStr = Object.entries(a.params)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');
      return `  - ${a.name}(${paramStr}) — ${a.description}`;
    });

    const classStr = manifest.classNames
      .map((c) => `${c.name} (${c.color})`)
      .join(', ');

    sections.push(
      `RENDERER: ${type}\n` +
      `Setup: ${manifest.setup}\n` +
      `Actions:\n${actionLines.join('\n')}\n` +
      `ClassNames: ${classStr}\n` +
      `Example:\n${manifest.example}`
    );
  }

  return sections.join('\n\n');
}
