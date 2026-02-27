import { dijkstra, bfs, dfs, DEFAULT_GRAPH, kruskal, prim, DEFAULT_UNDIRECTED_GRAPH, maxflow, DEFAULT_FLOW_NETWORK } from './graph/index.js';
import { quicksort, mergesort, insertionSort, selectionSort, bubbleSort } from './sorting/index.js';
import { binarySearch } from './searching/index.js';
import { knapsack, lcs, editDistance, coinChange } from './dp/index.js';
import { linkedListReversal, stackOperations, queueOperations } from './linked/index.js';
import { bstInsert, heapOperations } from './tree/index.js';
import { gcd } from './math/gcd.js';

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
  quicksort: {
    run: (input) => quicksort(input.array),
    renderer: 'array',
    category: 'Sorting',
    defaultInput: { array: [38, 27, 43, 3, 9, 82, 10] },
    capabilities: { max_array_length: 15 },
  },
  mergesort: {
    run: (input) => mergesort(input.array),
    renderer: 'array',
    category: 'Sorting',
    defaultInput: { array: [38, 27, 43, 3, 9, 82, 10] },
    capabilities: { max_array_length: 15 },
  },
  insertion_sort: {
    run: (input) => insertionSort(input.array),
    renderer: 'array',
    category: 'Sorting',
    defaultInput: { array: [38, 27, 43, 3, 9, 82, 10] },
    capabilities: { max_array_length: 15 },
  },
  selection_sort: {
    run: (input) => selectionSort(input.array),
    renderer: 'array',
    category: 'Sorting',
    defaultInput: { array: [38, 27, 43, 3, 9, 82, 10] },
    capabilities: { max_array_length: 15 },
  },
  bubble_sort: {
    run: (input) => bubbleSort(input.array),
    renderer: 'array',
    category: 'Sorting',
    defaultInput: { array: [38, 27, 43, 3, 9, 82, 10] },
    capabilities: { max_array_length: 15 },
  },
  binary_search: {
    run: (input) => binarySearch(input.array, input.target),
    renderer: 'array',
    category: 'Searching',
    defaultInput: { array: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], target: 23 },
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
  lcs: {
    run: (input) => lcs(input.str1, input.str2),
    renderer: 'table',
    category: 'Dynamic Programming',
    defaultInput: { str1: 'ABCBDAB', str2: 'BDCAB' },
    capabilities: { max_table_rows: 8, max_table_cols: 8 },
  },
  edit_distance: {
    run: (input) => editDistance(input.str1, input.str2),
    renderer: 'table',
    category: 'Dynamic Programming',
    defaultInput: { str1: 'kitten', str2: 'sitting' },
    capabilities: { max_table_rows: 8, max_table_cols: 8 },
  },
  coin_change: {
    run: (input) => coinChange(input.coins, input.amount),
    renderer: 'table',
    category: 'Dynamic Programming',
    defaultInput: { coins: [1, 5, 10, 25], amount: 36 },
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
  bst_insert: {
    run: (input) => bstInsert(input.values),
    renderer: 'tree',
    category: 'Trees',
    defaultInput: { values: [5, 3, 7, 1, 4, 6, 8] },
    capabilities: {},
  },
  heap_operations: {
    run: (input) => heapOperations(input.operations),
    renderer: 'tree',
    category: 'Trees',
    defaultInput: {
      operations: [
        { type: 'insert', value: 10 },
        { type: 'insert', value: 4 },
        { type: 'insert', value: 15 },
        { type: 'insert', value: 1 },
        { type: 'insert', value: 7 },
        { type: 'extract_min' },
        { type: 'insert', value: 3 },
        { type: 'extract_min' },
      ],
    },
    capabilities: {},
  },
  linked_list_reversal: {
    run: (input) => linkedListReversal(input.values),
    renderer: 'linked',
    category: 'Linked Structures',
    defaultInput: { values: [1, 2, 3, 4, 5] },
    capabilities: {},
  },
  stack_operations: {
    run: (input) => stackOperations(input.operations),
    renderer: 'linked',
    category: 'Linked Structures',
    defaultInput: {
      operations: [
        { type: 'push', value: 10 },
        { type: 'push', value: 20 },
        { type: 'push', value: 30 },
        { type: 'peek' },
        { type: 'pop' },
        { type: 'pop' },
        { type: 'peek' },
      ],
    },
    capabilities: {},
  },
  queue_operations: {
    run: (input) => queueOperations(input.operations),
    renderer: 'linked',
    category: 'Linked Structures',
    defaultInput: {
      operations: [
        { type: 'enqueue', value: 10 },
        { type: 'enqueue', value: 20 },
        { type: 'enqueue', value: 30 },
        { type: 'peek' },
        { type: 'dequeue' },
        { type: 'dequeue' },
        { type: 'peek' },
      ],
    },
    capabilities: {},
  },
  gcd: {
    run: (input) => gcd(input.a, input.b),
    renderer: 'array',
    category: 'Math',
    defaultInput: { a: 48, b: 18 },
    capabilities: {},
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
  return 'graph';
}
