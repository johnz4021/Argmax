/**
 * Default context panel definitions for each algorithm.
 * These are auto-configured when run_algorithm completes,
 * so the agent doesn't need to specify them.
 */

const PANEL_DEFAULTS = {
  // --- Graph algorithms ---
  dijkstra: [
    { id: 'distances', type: 'key_value', title: 'Distances' },
    { id: 'pq', type: 'collection', title: 'Priority Queue' },
  ],
  bfs: [
    { id: 'visited', type: 'collection', title: 'Visited' },
    { id: 'queue', type: 'collection', title: 'Queue' },
  ],
  dfs: [
    { id: 'visited', type: 'collection', title: 'Visited' },
  ],
  kruskal: [
    { id: 'mst_weight', type: 'key_value', title: 'MST' },
    { id: 'decisions', type: 'log', title: 'Edge Decisions' },
  ],
  prim: [
    { id: 'keys', type: 'key_value', title: 'Keys' },
    { id: 'decisions', type: 'log', title: 'Decisions' },
  ],
  maxflow: [
    { id: 'flow_status', type: 'key_value', title: 'Flow Status' },
    { id: 'aug_paths', type: 'log', title: 'Augmenting Paths' },
  ],

  // --- Sorting algorithms ---
  quicksort: [
    { id: 'stats', type: 'key_value', title: 'Stats' },
  ],
  mergesort: [
    { id: 'stats', type: 'key_value', title: 'Stats' },
  ],
  bubble_sort: [
    { id: 'stats', type: 'key_value', title: 'Stats' },
  ],
  insertion_sort: [
    { id: 'stats', type: 'key_value', title: 'Stats' },
  ],
  selection_sort: [
    { id: 'stats', type: 'key_value', title: 'Stats' },
  ],

  // --- Searching ---
  binary_search: [
    { id: 'bounds', type: 'key_value', title: 'Search Bounds' },
  ],

  // --- DP algorithms ---
  knapsack: [
    { id: 'expression', type: 'expression', title: 'Recurrence' },
    { id: 'decisions', type: 'log', title: 'Decisions' },
  ],
  lcs: [
    { id: 'expression', type: 'expression', title: 'Recurrence' },
    { id: 'decisions', type: 'log', title: 'Decisions' },
  ],
  edit_distance: [
    { id: 'expression', type: 'expression', title: 'Recurrence' },
    { id: 'decisions', type: 'log', title: 'Decisions' },
  ],
  coin_change: [
    { id: 'expression', type: 'expression', title: 'Recurrence' },
    { id: 'decisions', type: 'log', title: 'Decisions' },
  ],

  // --- Tree algorithms ---
  bst_insert: [
    { id: 'stats', type: 'key_value', title: 'Tree Info' },
  ],
  heap_operations: [
    { id: 'heap_array', type: 'collection', title: 'Heap Array' },
  ],

  // --- Linked structure algorithms ---
  linked_list_reversal: [
    { id: 'pointers', type: 'key_value', title: 'Pointers' },
  ],
  stack_operations: [
    { id: 'stats', type: 'key_value', title: 'Stack Info' },
  ],
  queue_operations: [
    { id: 'stats', type: 'key_value', title: 'Queue Info' },
  ],
};

/**
 * Return the default context panels for a given algorithm.
 * @param {string} algorithm - Algorithm identifier (e.g. 'dijkstra', 'knapsack')
 * @returns {Array<{id: string, type: string, title: string}>}
 */
export function getDefaultContextPanels(algorithm) {
  return PANEL_DEFAULTS[algorithm] || [];
}
