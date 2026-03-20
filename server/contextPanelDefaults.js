/**
 * Default context panel definitions for each algorithm.
 * These are auto-configured when run_algorithm completes,
 * so the agent doesn't need to specify them.
 */

import { PSEUDOCODE } from './pseudocode.js';

const PANEL_DEFAULTS = {
  // --- Graph algorithms ---
  dijkstra: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.dijkstra } },
    { id: 'distances', type: 'key_value', title: 'Distances' },
    { id: 'pq', type: 'collection', title: 'Priority Queue' },
  ],
  bfs: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.bfs } },
    { id: 'visited', type: 'collection', title: 'Visited' },
    { id: 'queue', type: 'collection', title: 'Queue' },
    { id: 'distances', type: 'key_value', title: 'Distances' },
  ],
  dfs: [
    { id: 'visited', type: 'collection', title: 'Visited' },
    { id: 'stack', type: 'collection', title: 'Call Stack' },
  ],
  kruskal: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.kruskal } },
    { id: 'mst_weight', type: 'key_value', title: 'MST' },
    { id: 'decisions', type: 'log', title: 'Edge Decisions' },
  ],
  prim: [
    { id: 'keys', type: 'key_value', title: 'Keys' },
    { id: 'decisions', type: 'log', title: 'Decisions' },
  ],
  maxflow: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.maxflow } },
    { id: 'flow_status', type: 'key_value', title: 'Flow Status' },
    { id: 'residual', type: 'key_value', title: 'Residual Capacities' },
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
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.binary_search } },
    { id: 'bounds', type: 'key_value', title: 'Search Bounds' },
  ],

  // --- DP algorithms ---
  knapsack: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.knapsack } },
    { id: 'items', type: 'key_value', title: 'Items' },
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

  // --- Math ---
  gcd: [
    { id: 'stats', type: 'key_value', title: 'GCD Progress' },
  ],

  // --- Complexity Theory ---
  graph_coloring_np: [
    { id: 'stats', type: 'key_value', title: 'Statistics' },
    { id: 'concepts', type: 'key_value', title: 'Key Concepts' },
    { id: 'attempt_log', type: 'log', title: 'Coloring Attempts' },
  ],
  poly_reduction: [
    { id: 'formula', type: 'expression', title: '3-SAT Formula',
      initial_data: { label: '3-SAT Formula', lines: [
        { label: 'C₁', text: '(x₁ ∨ ¬x₂ ∨ x₃)' },
        { label: 'C₂', text: '(¬x₁ ∨ x₂ ∨ ¬x₃)' },
        { label: 'C₃', text: '(x₁ ∨ x₂ ∨ x₃)' },
      ] } },
    { id: 'reduction_status', type: 'key_value', title: 'Reduction' },
    { id: 'log', type: 'log', title: 'Construction Log' },
  ],

  // --- Graph (continued) ---
  bellman_ford: [
    { id: 'pseudocode', type: 'pseudocode', title: 'Algorithm',
      initial_data: { lines: PSEUDOCODE.bellman_ford } },
    { id: 'distances', type: 'key_value', title: 'Distances' },
    { id: 'round_info', type: 'key_value', title: 'Round' },
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

// --- Mode-based presets for non-execution reasoning modes ---

const MODE_DEFAULTS = {
  greedy_design: {
    renderer: null, // determined by keyword matching on target algorithm
    context_panels: [
      {
        id: 'greedy_rule', type: 'expression', title: 'Greedy Rule',
        initial_data: { label: 'Greedy Rule', lines: [
          { label: 'Criterion', text: '___' },
        ] },
      },
      {
        id: 'proof_skeleton', type: 'expression', title: 'Proof Skeleton',
        initial_data: { label: 'Exchange Argument', lines: [
          { label: 'Lower bound', text: '___' },
          { label: 'Upper bound', text: '___' },
          { label: 'Combining', text: '___' },
        ] },
      },
    ],
  },
  dp_design: {
    renderer: 'table',
    context_panels: [
      {
        id: 'dp_definition', type: 'expression', title: 'DP Definition',
        initial_data: { label: 'Subproblem', lines: [
          { label: 'Definition', text: '___' },
        ] },
      },
      {
        id: 'recurrence', type: 'expression', title: 'Recurrence',
        initial_data: { label: 'Recurrence', lines: [
          { label: 'Recurrence', text: '___' },
          { label: 'Base case', text: '___' },
        ] },
      },
    ],
  },
  modeling: {
    renderer: 'graph',
    context_panels: [
      {
        id: 'formulation', type: 'expression', title: 'Formulation',
        initial_data: { label: 'Formulation', lines: [
          { label: 'Variables', text: '___' },
          { label: 'Objective', text: '___' },
          { label: 'Constraints', text: '___' },
        ] },
      },
    ],
  },
  dc_design: {
    renderer: null,
    context_panels: [
      {
        id: 'dc_structure', type: 'expression', title: 'D&C Structure',
        initial_data: { label: 'Divide & Conquer', lines: [
          { label: 'Split', text: '___' },
          { label: 'Subproblems', text: '___' },
          { label: 'Combine', text: '___' },
          { label: '$T(n)$', text: '___' },
        ] },
      },
    ],
  },
  runtime: {
    renderer: null,
    context_panels: [
      {
        id: 'runtime_analysis', type: 'expression', title: 'Runtime Analysis',
        initial_data: { label: 'Runtime', lines: [
          { label: '$T(n)$', text: '___' },
        ] },
      },
    ],
  },
};

/**
 * Return the default renderer and context panels for a non-execution reasoning mode.
 * @param {string} reasoning_mode - e.g. 'greedy_design', 'dp_design', 'modeling'
 * @returns {{ renderer: string|null, context_panels: Array } | null}
 */
export function getModeDefaultPanels(reasoning_mode) {
  return MODE_DEFAULTS[reasoning_mode] || null;
}
