// Ford-Fulkerson Max Flow (Edmonds-Karp BFS variant)

export const DEFAULT_FLOW_NETWORK = {
  nodes: [
    { id: 'S', label: 'S' },
    { id: 'A', label: 'A' },
    { id: 'B', label: 'B' },
    { id: 'C', label: 'C' },
    { id: 'D', label: 'D' },
    { id: 'T', label: 'T' },
  ],
  edges: [
    { source: 'S', target: 'A', weight: 10 },
    { source: 'S', target: 'B', weight: 5 },
    { source: 'A', target: 'B', weight: 5 },
    { source: 'A', target: 'C', weight: 7 },
    { source: 'B', target: 'D', weight: 10 },
    { source: 'C', target: 'T', weight: 7 },
    { source: 'D', target: 'T', weight: 8 },
  ],
  directed: true,
  positions: {
    S: { x: 100, y: 200 },
    A: { x: 300, y: 100 },
    B: { x: 300, y: 300 },
    C: { x: 500, y: 100 },
    D: { x: 500, y: 300 },
    T: { x: 700, y: 200 },
  },
};

export function maxflow(graph, source, sink) {
  const nodes = graph.nodes.map((n) => n.id);
  const edges = graph.edges;

  // Build adjacency with capacity
  const capacity = {};
  const flow = {};
  const adj = {};

  for (const id of nodes) {
    adj[id] = new Set();
  }

  for (const e of edges) {
    const key = `${e.source}->${e.target}`;
    const revKey = `${e.target}->${e.source}`;
    capacity[key] = e.weight;
    if (!capacity[revKey]) capacity[revKey] = 0;
    flow[key] = 0;
    if (!flow[revKey]) flow[revKey] = 0;
    adj[e.source].add(e.target);
    adj[e.target].add(e.source); // reverse edge for residual graph
  }

  function getEdgeLabels() {
    return edges.map((e) => {
      const key = `${e.source}->${e.target}`;
      const f = flow[key];
      const c = capacity[key];
      return {
        from: e.source,
        to: e.target,
        label: `${f}/${c}`,
        saturated: f >= c,
      };
    });
  }

  function bfs() {
    const parent = {};
    const visited = new Set([source]);
    const queue = [source];
    parent[source] = null;

    while (queue.length > 0) {
      const u = queue.shift();
      for (const v of adj[u]) {
        const key = `${u}->${v}`;
        const residual = capacity[key] - flow[key];
        if (!visited.has(v) && residual > 0) {
          visited.add(v);
          parent[v] = u;
          if (v === sink) return parent;
          queue.push(v);
        }
      }
    }
    return null;
  }

  function reconstructPath(parent) {
    const path = [];
    let v = sink;
    while (v !== null) {
      path.unshift(v);
      v = parent[v];
    }
    return path;
  }

  const trace = [];

  // Init step
  trace.push({
    type: 'init',
    description: 'Initialize all flows to 0',
    edge_labels: getEdgeLabels(),
    total_flow: 0,
  });

  let totalFlow = 0;
  let iteration = 0;

  while (true) {
    const parent = bfs();
    if (!parent) {
      // No more augmenting paths
      trace.push({
        type: 'no_more_paths',
        description: 'No more augmenting paths found in residual graph',
        edge_labels: getEdgeLabels(),
        total_flow: totalFlow,
      });
      break;
    }

    iteration++;
    const path = reconstructPath(parent);

    // Find bottleneck
    let bottleneck = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      const key = `${path[i]}->${path[i + 1]}`;
      const residual = capacity[key] - flow[key];
      bottleneck = Math.min(bottleneck, residual);
    }

    trace.push({
      type: 'find_augmenting_path',
      description: `BFS found augmenting path: ${path.join(' → ')} with bottleneck capacity ${bottleneck}`,
      path,
      bottleneck,
      iteration,
      edge_labels: getEdgeLabels(),
      total_flow: totalFlow,
    });

    // Push flow
    for (let i = 0; i < path.length - 1; i++) {
      const fwdKey = `${path[i]}->${path[i + 1]}`;
      const revKey = `${path[i + 1]}->${path[i]}`;
      flow[fwdKey] += bottleneck;
      flow[revKey] -= bottleneck;
    }
    totalFlow += bottleneck;

    trace.push({
      type: 'push_flow',
      description: `Pushed ${bottleneck} units of flow along path. Total flow: ${totalFlow}`,
      path,
      bottleneck,
      iteration,
      edge_labels: getEdgeLabels(),
      total_flow: totalFlow,
    });
  }

  // Compute min cut: BFS from source in residual graph
  const reachable = new Set([source]);
  const queue = [source];
  while (queue.length > 0) {
    const u = queue.shift();
    for (const v of adj[u]) {
      const key = `${u}->${v}`;
      if (!reachable.has(v) && capacity[key] - flow[key] > 0) {
        reachable.add(v);
        queue.push(v);
      }
    }
  }

  const sourceSide = nodes.filter((n) => reachable.has(n));
  const sinkSide = nodes.filter((n) => !reachable.has(n));
  const cutEdges = edges.filter(
    (e) => reachable.has(e.source) && !reachable.has(e.target)
  );
  const minCutValue = cutEdges.reduce((sum, e) => sum + e.weight, 0);

  trace.push({
    type: 'compute_min_cut',
    description: `Min cut separates {${sourceSide.join(', ')}} from {${sinkSide.join(', ')}}. Cut capacity = ${minCutValue}`,
    source_side: sourceSide,
    sink_side: sinkSide,
    cut_edges: cutEdges.map((e) => ({ from: e.source, to: e.target, capacity: e.weight })),
    min_cut_value: minCutValue,
    edge_labels: getEdgeLabels(),
    total_flow: totalFlow,
  });

  trace.push({
    type: 'result',
    description: `Maximum flow = ${totalFlow}, which equals the minimum cut = ${minCutValue} (Max-Flow Min-Cut Theorem)`,
    max_flow: totalFlow,
    min_cut: minCutValue,
    source_side: sourceSide,
    sink_side: sinkSide,
    edge_labels: getEdgeLabels(),
  });

  return trace;
}
