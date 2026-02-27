# Argmax: Algorithm Resilience Architecture Plan

## Problem

The guided agent (`guidedAgent.js`) analyzes user problems and constructs algorithm inputs that don't always match the assumptions baked into our Tier 1 algorithm implementations. Example: `maxflow.js` has partial undirected support (capacity initialization handles both directions) but its helper functions (`getEdgeLabels`, `getResidualGraph`) still only iterate original edges, producing incomplete results on undirected graphs. This class of bug will recur across algorithms — the guided agent can construct any valid input, but implementations are coupled to their `defaultInput` shapes.

The fix has three phases, each independently shippable.

---

## Phase 1: Fix existing algorithms for directed/undirected support

**Goal:** Every graph algorithm correctly handles `graph.directed === false`.

### 1a. `server/algorithms/graph/maxflow.js`

The edge initialization loop already has a partial fix — it checks `const directed = graph.directed !== false` and accumulates capacity in both directions for undirected graphs:

```js
if (directed) {
  capacity[fwd] = e.weight;
  if (!capacity[rev]) capacity[rev] = 0;
} else {
  capacity[fwd] = (capacity[fwd] || 0) + e.weight;
  capacity[rev] = (capacity[rev] || 0) + e.weight;
}
```

This is correct. The BFS, bottleneck, and flow push logic all read from the capacity/flow maps and need no changes.

**What's still broken:** `getEdgeLabels()` and `getResidualGraph()` only iterate over `edges` (the original edge list). For undirected graphs, reverse-direction edges now carry real capacity too, but these functions never report them. For undirected graphs, include both directions in the output of both functions — either by iterating over all keys in the `capacity` map that have nonzero capacity, or by explicitly adding the reverse of each edge in `edges`.

### 1b. `server/algorithms.js` — dijkstra, bfs, dfs

These three functions build one-way adjacency lists:

```js
adj[edge.source].push({ target: edge.target, weight: edge.weight });
```

Add a `graph.directed` check. When `false`, also push the reverse:

```js
adj[edge.target].push({ target: edge.source, weight: edge.weight });
```

The graph parameter is already passed in. BFS and DFS don't use weights so just push the target. Dijkstra already handles weights. No other changes needed — visited sets prevent infinite loops on undirected edges.

### 1c. Verify Kruskal and Prim

`kruskal.js` and `prim.js` already add both directions manually. Verify they work correctly when `graph.directed === false` is set AND when edges are listed in both directions (no double-counting). Prim's adjacency builder has a dedup check — make sure it's correct:

```js
if (!adj[edge.target].some((e) => e.target === edge.source && e.weight === edge.weight))
```

This dedup is weight-based, which could fail if two different edges have the same weight. Consider switching to a Set-based dedup or just always adding both and letting the algorithm handle it.

---

## Phase 2: Add capability metadata to registry + validation layer

**Goal:** Mismatches between what the guided agent plans and what an algorithm supports are caught *before* execution, not silently producing wrong results.

### 2a. Add `capabilities` field to each registry entry in `server/algorithms/registry.js`

Add a `capabilities` object to each algorithm in `ALGORITHMS`. Schema:

```js
{
  supports_directed: true,       // can handle directed graphs
  supports_undirected: true,     // can handle undirected graphs
  supports_weighted: true,       // can handle weighted edges
  supports_unweighted: true,     // can handle unweighted (or unit-weight) edges
  max_nodes: 12,                 // viz limit
  max_edges: 20,                 // viz limit
  // DP-specific:
  supports_repeat_items: false,  // coin_change: true, knapsack: false
  supports_fractional: false,    // fractional knapsack variant
  // Array-specific:
  max_array_length: 15,
}
```

Fill these in for every algorithm based on what the implementation actually supports (post Phase 1 fixes). Examples:

- `dijkstra`: `{ supports_directed: true, supports_undirected: true, supports_weighted: true, supports_unweighted: true }`
- `maxflow`: `{ supports_directed: true, supports_undirected: true, supports_weighted: true }` (after Phase 1 fix)
- `knapsack`: `{ supports_repeat_items: false, supports_fractional: false }`
- `coin_change`: `{ supports_repeat_items: true }`

### 2b. Create `server/algorithms/validateInput.js`

New file. Export a function:

```js
export function validateAlgorithmInput(algorithmId, input, modelContract)
```

This function:

1. Looks up `ALGORITHMS[algorithmId].capabilities`
2. Infers requirements from the input (e.g., `input.graph?.directed === false` → requires `supports_undirected`)
3. If `modelContract` is provided, cross-checks its assumptions against capabilities
4. Returns `{ valid: boolean, warnings: string[], errors: string[], adaptations: Adaptation[] }`

Where `Adaptation` is a suggested automatic fix, e.g.:

```js
{ type: 'double_edges', description: 'Convert undirected edges to bidirectional directed edges' }
{ type: 'add_unit_weights', description: 'Add weight=1 to unweighted edges' }
```

### 2c. Create `server/algorithms/adaptInput.js`

New file. Export a function:

```js
export function adaptAlgorithmInput(algorithmId, input, adaptations)
```

This applies the adaptations from the validator. Common adapters:

- `double_edges`: For each edge in `input.graph.edges`, add a reverse edge if not present. Set `directed: true`.
- `add_unit_weights`: Set `weight: 1` on all edges missing a weight.
- `normalize_capacity_labels`: Ensure edge weights are labeled as capacities for flow algorithms.

This is the safety net — if an algorithm doesn't natively support a variant but there's a clean mechanical transformation, apply it automatically.

### 2d. Wire validation into `handleToolCall` in `server/agent.js`

In the `run_algorithm` case of `handleToolCall`, after building `registryInput` but before calling `runRegisteredAlgorithm`:

```js
case 'run_algorithm': {
  // ... existing input building ...

  // NEW: validate and adapt
  const validation = validateAlgorithmInput(algo, registryInput, session.modelContract);
  if (validation.errors.length > 0) {
    return { error: validation.errors.join('; '), suggestions: validation.warnings };
  }
  if (validation.adaptations.length > 0) {
    registryInput = adaptAlgorithmInput(algo, registryInput, validation.adaptations);
  }

  // ... existing runRegisteredAlgorithm call ...
}
```

Also store `session.modelContract` — set it in the `classify_problem` handler in `guidedAgent.js`:

```js
if (block.name === 'classify_problem') {
  session.modelContract = plan.internal_model_contract;  // NEW
  // ... rest of existing handler ...
}
```

### 2e. Expose capabilities in `run_algorithm` tool result

When `run_algorithm` returns its result to the agent, include the capability metadata and any adaptations that were applied:

```js
return {
  success: true,
  algorithm: algo,
  capabilities: algoInfo.capabilities,
  adaptations_applied: validation.adaptations.map(a => a.description),
  // ... rest of existing return ...
};
```

This way the agent knows if input was adapted and can mention it in narration.

---

## Phase 3: Wire up Tier 2 fallback for unsupported variants

**Goal:** When a problem genuinely doesn't fit any Tier 1 algorithm (even with adaptations), fall back to the author agent to generate a custom trace function.

### 3a. Switch `handleToolCall` to use `runAlgorithmWithFallback`

In `server/agent.js`, the `run_algorithm` case currently calls `runRegisteredAlgorithm` (Tier 1 only). The fallback chain already exists in `registry.js` as `runAlgorithmWithFallback` but is never called. Change the call to:

```js
const result = await runAlgorithmWithFallback(algo, registryInput);
```

Note this is `async` — the Tier 2 path calls the Anthropic API via `authorAgent.js`. Make sure the `handleToolCall` function properly awaits it (it already returns a promise in some paths).

Include the `tier` field in the result returned to the agent so it knows whether it got a hand-written or generated trace:

```js
return {
  success: true,
  tier: result.tier,  // 1 = registry, 2 = generated
  // ...
};
```

### 3b. Improve `authorAgent.js` prompt with capability context

When Tier 2 is triggered, pass the model contract and the reason Tier 1 failed into the author agent prompt. `generateTraceGenerator` already accepts three parameters (`algorithmName`, `renderer`, `description`). Add an optional fourth `context` parameter:

```js
export async function generateTraceGenerator(algorithmName, renderer, description, context)
```

Where `context` can include:
- `modelContract`: the guided agent's model contract
- `failureReason`: why Tier 1 couldn't handle it (from the validator)
- `closestAlgorithm`: which Tier 1 algorithm was closest

This gives the author agent much better signal for generating a correct trace function.

### 3c. Add trace validation in `sandbox.js`

The current sandbox validates that trace steps have `type` and `description`. Add renderer-specific validation:

- For `graph` renderer: trace steps with `type: 'visit_node'` must have a `node` field, etc.
- For `table` renderer: `init_table` must have `rows` and `cols` or `size`
- For `array` renderer: `init` must have `array`

This catches broken generated traces before they hit the client and produce confusing visualizations.

### 3d. Validation gate in the fallback chain

In `runAlgorithmWithFallback`, after the Tier 2 trace is generated, run the validation + adaptation from Phase 2 on the *output trace* (not just the input). Check that:
- The trace starts with an `init`-type step
- The trace ends with a `result`-type step
- No trace step references node IDs or indices that don't exist in the input

If validation fails, return an error to the agent rather than sending a broken trace to the client.

---

## File change summary

| File | Phase | Change |
|------|-------|--------|
| `server/algorithms/graph/maxflow.js` | 1 | Fix `getEdgeLabels()` and `getResidualGraph()` to include reverse edges for undirected graphs (capacity init already handled) |
| `server/algorithms.js` (dijkstra/bfs/dfs) | 1 | Add reverse edges when `graph.directed === false` |
| `server/algorithms/graph/kruskal.js` | 1 | Verify dedup logic for undirected edges |
| `server/algorithms/graph/prim.js` | 1 | Verify dedup logic for undirected edges |
| `server/algorithms/registry.js` | 2 | Add `capabilities` to each ALGORITHMS entry |
| `server/algorithms/validateInput.js` | 2 | **New file** — input validation against capabilities |
| `server/algorithms/adaptInput.js` | 2 | **New file** — automatic input adaptation |
| `server/agent.js` | 2+3 | Wire validation before `run_algorithm`, switch to `runAlgorithmWithFallback` |
| `server/guidedAgent.js` | 2 | Store `session.modelContract` from `classify_problem` |
| `server/authorAgent.js` | 3 | Add 4th `context` parameter to `generateTraceGenerator` for better generation |
| `server/algorithms/sandbox.js` | 3 | Add renderer-specific trace validation |

## Suggested implementation order

1. Phase 1 (all of it) — fixes the immediate bugs
2. Phase 2a + 2b + 2d — gets validation wired in so mismatches fail loudly
3. Phase 2c — adds automatic adaptation so common mismatches self-heal
4. Phase 2e — closes the loop so the agent knows what happened
5. Phase 3a + 3b — enables Tier 2 fallback
6. Phase 3c + 3d — hardens Tier 2 output quality

Each step is independently testable. Phase 1 can ship immediately. Phase 2 prevents future silent failures. Phase 3 expands what problems the guided agent can handle.
