import { dijkstra, bfs, dfs, DEFAULT_GRAPH, kruskal, prim, DEFAULT_UNDIRECTED_GRAPH, maxflow, DEFAULT_FLOW_NETWORK, bellmanFord, DEFAULT_BELLMAN_FORD_GRAPH, dagShortest, DEFAULT_DAG_GRAPH, unionFind, DEFAULT_UNION_FIND_GRAPH, topologicalSort, backtracking } from './graph/index.js';
import { mergesort } from './sorting/index.js';
import { knapsack, editDistance, lcs, coinChange } from './dp/index.js';
import { polyReduction, DEFAULT_REDUCTION_FORMULA } from './complexity/index.js';
import { quickselect, slidingWindow, DEFAULT_SLIDING_WINDOW_INPUT, binarySearch, twoPointers, intervalMerge, intervalScheduling, monotonicStack } from './searching/index.js';
import { huffman } from './compression/index.js';
import { heapOperations, trie, DEFAULT_TRIE_INPUT, bstInsert } from './tree/index.js';
import { linkedListReversal, stackOperations, queueOperations } from './linked/index.js';

/**
 * Central algorithm registry. Each entry defines:
 * - run: function(input) -> trace[]
 * - renderer: which client renderer to use
 * - category: grouping for the UI
 * - defaultInput: sample data for demos
 */
export const ALGORITHMS = {
  dijkstra: {
    run: (input) => dijkstra(input.graph, input.source),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_GRAPH, source: 'A' },
    capabilities: { supports_directed: true, supports_undirected: true, supports_weighted: true, supports_unweighted: true, max_nodes: 12, max_edges: 20 },
  },
  bfs: {
    run: (input) => bfs(input.graph, input.source),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_GRAPH, source: 'A' },
    capabilities: { supports_directed: true, supports_undirected: true, supports_weighted: false, supports_unweighted: true, max_nodes: 12, max_edges: 20 },
  },
  dfs: {
    run: (input) => dfs(input.graph, input.source),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_GRAPH, source: 'A' },
    capabilities: { supports_directed: true, supports_undirected: true, supports_weighted: false, supports_unweighted: true, max_nodes: 12, max_edges: 20 },
  },
  mergesort: {
    run: (input) => mergesort(input.array),
    renderer: 'array',
    category: 'Sorting',
    defaultInput: { array: [38, 27, 43, 3, 9, 82, 10] },
    capabilities: { max_array_length: 15 },
  },
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
      capacity: 7,
    },
    capabilities: { max_table_rows: 8, max_table_cols: 8 },
  },
  edit_distance: {
    run: (input) => editDistance(input.str1, input.str2),
    renderer: 'table',
    category: 'Dynamic Programming',
    defaultInput: { str1: 'kitten', str2: 'sitting' },
    capabilities: { max_table_rows: 8, max_table_cols: 8 },
  },
  kruskal: {
    run: (input) => kruskal(input.graph),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_UNDIRECTED_GRAPH },
    capabilities: { supports_directed: false, supports_undirected: true, supports_weighted: true, supports_unweighted: false, max_nodes: 12, max_edges: 20 },
  },
  prim: {
    run: (input) => prim(input.graph, input.source),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_UNDIRECTED_GRAPH, source: 'A' },
    capabilities: { supports_directed: false, supports_undirected: true, supports_weighted: true, supports_unweighted: false, max_nodes: 12, max_edges: 20 },
  },
  maxflow: {
    run: (input) => maxflow(input.graph, input.source, input.sink),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_FLOW_NETWORK, source: 'S', sink: 'T' },
    capabilities: { supports_directed: true, supports_undirected: true, supports_weighted: true, supports_unweighted: false, max_nodes: 12, max_edges: 20 },
  },
  bellman_ford: {
    run: (input) => bellmanFord(input.graph, input.source),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_BELLMAN_FORD_GRAPH, source: 'A' },
    capabilities: { supports_directed: true, supports_undirected: true, supports_weighted: true, supports_negative_weights: true, max_nodes: 12, max_edges: 20 },
  },
  poly_reduction: {
    run: (input) => polyReduction(input.formula),
    renderer: 'graph',
    category: 'Complexity Theory',
    defaultInput: { formula: DEFAULT_REDUCTION_FORMULA, graph: { nodes: [], edges: [], directed: false, positions: {} } },
    capabilities: { supports_directed: false, max_nodes: 12 },
  },
  dag_shortest: {
    run: (input) => dagShortest(input.graph, input.source),
    renderer: 'graph',
    category: 'Dynamic Programming',
    defaultInput: { graph: DEFAULT_DAG_GRAPH, source: 'S' },
    capabilities: { supports_directed: true, supports_undirected: false, supports_weighted: true, supports_negative_weights: true, max_nodes: 12, max_edges: 20 },
  },
  quickselect: {
    run: (input) => quickselect(input.array, input.k ?? 0),
    renderer: 'array',
    category: 'Divide and Conquer',
    defaultInput: { array: [7, 2, 10, 3, 8, 1, 5], k: 3 },
    capabilities: { max_array_length: 12 },
  },
  huffman: {
    run: (input) => huffman(input.string ?? 'abcde'),
    renderer: 'tree',
    category: 'Greedy Algorithms',
    defaultInput: { string: 'abcde' },
    capabilities: { max_nodes: 30 },
  },
  heap_ops: {
    run: (input) => heapOperations(input.operations),
    renderer: 'tree',
    category: 'Data Structures',
    defaultInput: { operations: [{ type: 'insert', value: 3 }, { type: 'insert', value: 1 }, { type: 'insert', value: 5 }, { type: 'extract_min' }] },
    capabilities: { max_ops: 10 },
  },
  sliding_window: {
    run: (input) => slidingWindow(input.array, input.window_size ?? 3),
    renderer: 'array',
    category: 'Algorithms',
    defaultInput: DEFAULT_SLIDING_WINDOW_INPUT,
    capabilities: { max_array_length: 15 },
  },
  trie: {
    run: (input) => trie(input.operations),
    renderer: 'graph',
    category: 'Data Structures',
    defaultInput: DEFAULT_TRIE_INPUT,
    capabilities: { max_words: 10 },
  },
  union_find: {
    run: (input) => unionFind(input.graph),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: { graph: DEFAULT_UNION_FIND_GRAPH },
    capabilities: { max_nodes: 12, max_edges: 20 },
  },

  // ── Phase 1: Free wins ────────────────────────────────────────────────────
  binary_search: {
    run: (input) => binarySearch(input.array, input.target),
    renderer: 'array',
    category: 'Searching',
    defaultInput: { array: [1, 3, 5, 7, 9, 11, 13], target: 7 },
    capabilities: { max_array_length: 20 },
  },
  coin_change: {
    run: (input) => coinChange(input.coins, input.amount),
    renderer: 'table',
    category: 'Dynamic Programming',
    defaultInput: { coins: [1, 5, 11], amount: 15 },
    capabilities: { max_table_cols: 20 },
  },
  lcs: {
    run: (input) => lcs(input.str1, input.str2),
    renderer: 'table',
    category: 'Dynamic Programming',
    defaultInput: { str1: 'ABCBDAB', str2: 'BDCAB' },
    capabilities: { max_table_rows: 8, max_table_cols: 8 },
  },
  bst_insert: {
    run: (input) => bstInsert(input.values),
    renderer: 'tree',
    category: 'Data Structures',
    defaultInput: { values: [5, 3, 7, 1, 4, 6, 8] },
    capabilities: { max_nodes: 15 },
  },
  linked_list_reversal: {
    run: (input) => linkedListReversal(input.values),
    renderer: 'linked',
    category: 'Data Structures',
    defaultInput: { values: [1, 2, 3, 4, 5] },
    capabilities: { max_length: 10 },
  },
  stack_operations: {
    run: (input) => stackOperations(input.operations),
    renderer: 'linked',
    category: 'Data Structures',
    defaultInput: { operations: [{ type: 'push', value: 3 }, { type: 'push', value: 1 }, { type: 'push', value: 5 }, { type: 'pop' }, { type: 'push', value: 2 }] },
    capabilities: { max_ops: 15 },
  },
  queue_operations: {
    run: (input) => queueOperations(input.operations),
    renderer: 'linked',
    category: 'Data Structures',
    defaultInput: { operations: [{ type: 'enqueue', value: 1 }, { type: 'enqueue', value: 2 }, { type: 'dequeue' }] },
    capabilities: { max_ops: 15 },
  },

  // ── Phase 2: New implementations ─────────────────────────────────────────
  topological_sort: {
    run: (input) => topologicalSort(input.graph),
    renderer: 'graph',
    category: 'Graph Algorithms',
    defaultInput: {
      graph: {
        nodes: [{ id: '0' }, { id: '1' }, { id: '2' }, { id: '3' }],
        edges: [{ source: '0', target: '1' }, { source: '0', target: '2' }, { source: '1', target: '3' }, { source: '2', target: '3' }],
        directed: true,
      },
    },
    capabilities: { supports_directed: true, supports_undirected: false, max_nodes: 12, max_edges: 20 },
  },
  two_pointers: {
    run: (input) => twoPointers(input.array, input.target),
    renderer: 'array',
    category: 'Searching',
    defaultInput: { array: [2, 7, 11, 15], target: 9 },
    capabilities: { max_array_length: 15 },
  },
  interval_merge: {
    run: (input) => intervalMerge(input.intervals),
    renderer: 'interval',
    category: 'Greedy Algorithms',
    defaultInput: { intervals: [{ start: 1, end: 3 }, { start: 2, end: 6 }, { start: 8, end: 10 }, { start: 15, end: 18 }] },
    capabilities: { max_intervals: 12 },
  },
  interval_scheduling: {
    run: (input) => intervalScheduling(input.jobs),
    renderer: 'interval',
    category: 'Greedy Algorithms',
    defaultInput: {
      jobs: [
        { id: 'a', name: 'A', start: 1, end: 4 },
        { id: 'b', name: 'B', start: 3, end: 5 },
        { id: 'c', name: 'C', start: 0, end: 6 },
        { id: 'd', name: 'D', start: 5, end: 7 },
        { id: 'e', name: 'E', start: 3, end: 9 },
        { id: 'f', name: 'F', start: 5, end: 9 },
        { id: 'g', name: 'G', start: 6, end: 10 },
        { id: 'h', name: 'H', start: 8, end: 11 },
      ],
    },
    capabilities: { max_jobs: 10, max_machines: 1 },
  },
  monotonic_stack: {
    run: (input) => monotonicStack(input.array),
    renderer: 'linked',
    category: 'Data Structures',
    defaultInput: { array: [2, 1, 5, 3, 6, 4, 8] },
    capabilities: { max_array_length: 12 },
  },
  backtracking: {
    run: (input) => backtracking(input.elements, 3),
    renderer: 'graph',
    category: 'Backtracking',
    defaultInput: { elements: [1, 2, 3] },
    capabilities: { max_nodes: 30, max_depth: 3, max_edges: 40 },
  },
};

/**
 * Run an algorithm from the registry (Tier 1 only).
 * Returns { trace, renderer, input } or throws if not found.
 */
export function runRegisteredAlgorithm(algorithmId, input) {
  const algo = ALGORITHMS[algorithmId];
  if (!algo) throw new Error(`Unknown algorithm: ${algorithmId}`);
  const actualInput = { ...algo.defaultInput, ...input };
  return {
    trace: algo.run(actualInput),
    renderer: algo.renderer,
    input: actualInput,
  };
}

/**
 * Run an algorithm with Tier 2 fallback (author agent).
 * Tier 1: Hand-written registry → Tier 2: Cached generated → Tier 2: Generate new
 */
export async function runAlgorithmWithFallback(algorithmId, input, context) {
  // Tier 1: Hand-written trace generator
  if (ALGORITHMS[algorithmId]) {
    const result = runRegisteredAlgorithm(algorithmId, input);
    return { ...result, tier: 1 };
  }

  // Tier 2: Lazy-import to avoid circular deps and keep startup fast
  const { getCachedGenerator, incrementHitCount, cacheGenerator } = await import('./cache.js');
  const { executeTraceInSandbox } = await import('./sandbox.js');

  // Check cache
  const cached = getCachedGenerator(algorithmId);
  if (cached) {
    incrementHitCount(algorithmId);
    const trace = executeTraceInSandbox(cached.code, input, 5000, cached.renderer);
    return { trace, renderer: cached.renderer, tier: 2 };
  }

  // Generate new trace generator
  const { generateTraceGenerator } = await import('../authorAgent.js');
  const renderer = guessRenderer(algorithmId);
  const code = await generateTraceGenerator(algorithmId, renderer, undefined, context);
  const trace = executeTraceInSandbox(code, input, 5000, renderer);

  // Validate node IDs in trace exist in input graph (for graph algorithms)
  if (renderer === 'graph' && input?.graph?.nodes) {
    const validNodeIds = new Set(input.graph.nodes.map(n => n.id));
    for (const step of trace) {
      if (step.node && !validNodeIds.has(step.node)) {
        console.warn(`[Registry] Trace references unknown node: ${step.node}`);
      }
      if (step.from && !validNodeIds.has(step.from)) {
        console.warn(`[Registry] Trace references unknown node: ${step.from}`);
      }
      if (step.to && !validNodeIds.has(step.to)) {
        console.warn(`[Registry] Trace references unknown node: ${step.to}`);
      }
    }
  }

  // Basic verification before caching
  if (trace.length >= 2) {
    cacheGenerator(algorithmId, { code, renderer, verifiedAt: Date.now() });
  }

  return { trace, renderer, tier: 2 };
}

/**
 * Heuristic to guess the renderer for an unknown algorithm.
 */
function guessRenderer(algorithmId) {
  const id = algorithmId.toLowerCase();
  if (id.includes('sort') || id.includes('search') || id.includes('pointer') || id.includes('window')) return 'array';
  if (id.includes('knapsack') || id.includes('lcs') || id.includes('edit') || id.includes('coin') || id.includes('matrix') || id.includes('dp')) return 'table';
  if (id.includes('tree') || id.includes('bst') || id.includes('avl') || id.includes('heap') || id.includes('red_black')) return 'tree';
  if (id.includes('linked') || id.includes('stack') || id.includes('queue')) return 'linked';
  if (id.includes('interval') || id.includes('schedule') || id.includes('machine') || id.includes('job') || id.includes('timeline') || id.includes('gantt') || id.includes('activity_selection')) return 'interval';
  return 'graph';
}
