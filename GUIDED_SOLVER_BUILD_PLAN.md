# Guided Problem Solver — Build Plan

## Context

Argmax is an algorithm visualization tutor. Students can currently:
1. Pick an algorithm from a list and get a narrated walkthrough
2. Paste a homework problem and get guided through it (the "Problem Solver" tab)

The Problem Solver feature (guided mode) needs a major overhaul. The current implementation uses a rigid phase structure: the agent analyzes the problem, asks multiple-choice questions, then runs an algorithm. This doesn't match how students actually need help.

**The new design is conversational.** The student pastes a problem, and the agent has a back-and-forth conversation to help them:
1. **Classify** — Figure out which algorithm family applies (shortest path, DP, greedy, etc.)
2. **Refresh** — Optionally show the relevant algorithm on a small canonical example
3. **Sketch the reduction** — Help the student transform the word problem into algorithm input, building the graph/table/array incrementally based on the student's natural language descriptions

The agent does NOT solve the problem for the student. It helps them understand which algorithm applies, how the algorithm works, and how to set up the input. The student does the conceptual work; the agent provides visualization and guided questions.

**Key architectural insight:** The student describes graph structure in natural language (e.g., "each node should be a vertex-battery pair"). The agent builds the graph incrementally, narrating each construction choice so the student can verify and correct. No drag-and-drop graph editor needed — the conversation IS the construction tool.

---

## Phase 1: Restructure the Guided Agent for Conversational Flow

### Goal
Replace the rigid plan-then-execute flow with a conversational agent that can go back and forth with the student, building graphs incrementally.

### Files to modify

**`server/guidedAgent.js`** — Major rewrite of `GUIDED_SYSTEM_PROMPT` and session loop.

Replace the current prompt with one that implements three fluid phases:

```
PHASE 1 — CLASSIFY (2-4 exchanges):
- Read the problem, identify candidate algorithm families
- Ask the student what kind of problem this is using send_options
- If wrong, give a conceptual nudge, re-ask once, then reveal
- Tag the problem panel with the identified algorithm family

PHASE 2 — REFRESH (0-2 minutes, skippable):
- Show the relevant algorithm on a small canonical example
- Compressed narration (5-8 segments, not 20)
- Always offer "I know this, move on" via send_options before starting

PHASE 3 — REDUCTION SKETCH (2-5 minutes, the core):
- Guide the student to describe the algorithm input in natural language
- Build the graph/table/array incrementally from their descriptions
- Narrate each construction choice: "I'm adding 6 driving edges — for example..."
- Ask the student to verify: "Does this capture everything?"
- If the student corrects something, rebuild
- When complete, optionally run the algorithm on the constructed input
- Verify against sample output if available
```

Remove the `plan_guided_session` tool entirely. Replace with a lighter internal classification tool:

```javascript
// New tool: classify_problem (replaces plan_guided_session)
{
  name: 'classify_problem',
  description: 'Record the identified algorithm family and problem type. Called once after classification phase.',
  input_schema: {
    type: 'object',
    properties: {
      algorithm_family: { type: 'string', description: 'e.g., "shortest_path", "dp", "greedy", "mst", "max_flow", "divide_and_conquer", "out_of_scope"' },
      target_algorithm: { type: 'string', description: 'Specific algorithm ID from registry, or "none"' },
      closest_algorithm: { type: 'string', description: 'If out of scope, closest available algorithm' },
      problem_summary: { type: 'string', description: 'One-sentence summary' },
      key_insight: { type: 'string', description: 'The main modeling insight the student needs' },
      has_sample_output: { type: 'boolean', description: 'Whether the problem provides sample I/O to verify against' },
      sample_output: { type: 'string', description: 'Expected output if available' },
    },
    required: ['algorithm_family', 'target_algorithm', 'problem_summary', 'key_insight'],
  },
}
```

Remove the Model Contract from the UI (no more key_value panel with State/Transitions/Cost/Constraints). Keep it in the agent's internal reasoning via the prompt, but don't display it to students — it's confusing for them.

**Key prompt additions for the reduction sketch phase:**

```
REDUCTION SKETCHING RULES:
- When the student describes nodes, call create_graph with just the nodes (no edges yet)
- When the student describes edges, call update_graph to add them incrementally
- ALWAYS narrate what you built: "I added 9 nodes arranged as a grid — vertices along the x-axis, batteries along the y-axis. Here they are."
- ALWAYS ask the student to verify: "Does (1,B1)→(2,B1) with weight 1/3 make sense? That's the time to drive from vertex 1 to 2 using battery 1."
- If the student says something is wrong, acknowledge and rebuild
- Keep the graph small (max 12 nodes, 20 edges). If the problem is larger, build a representative subset.

HANDLING STUDENT NATURAL LANGUAGE:
- "each node should be a pair of vertex and battery" → create_graph with (v,Bk) nodes
- "add driving edges where capacity allows" → update_graph with computed edges, narrate each
- "what if that edge had weight 2 instead?" → update_graph to modify, optionally re-run algorithm
- "I think the swap edges are wrong" → ask what they think is wrong, rebuild if needed
```

**Session loop changes in `startGuidedSession`:**

The current loop processes tool calls sequentially. Modify it so that after each `emit_segment`, if the agent is in the sketch phase and has asked a question, the loop waits for student input (either an option click via `guided_response` OR a typed message via a new `guided_message` event). The agent should receive typed messages as new user messages appended to the conversation, not as interrupts.

```javascript
// In the tool processing loop, after emit_segment in sketch phase:
if (block.name === 'emit_segment' && session.awaitingStudentInput) {
  // Wait for either guided_response (option click) or guided_message (typed text)
  const input = await waitForStudentInput(session);
  if (input.type === 'option') {
    // Handle as before
  } else if (input.type === 'message') {
    // Append as user message to conversation
    messages.push({ role: 'user', content: input.text });
  }
}
```

### Files to create

**`server/tools/updateGraph.js`** — New tool handler for incremental graph modification.

```javascript
// Tool schema
{
  name: 'update_graph',
  description: 'Add, remove, or modify nodes and edges on the current graph without replacing it. Use for incremental graph construction during reduction sketching.',
  input_schema: {
    type: 'object',
    properties: {
      add_nodes: {
        type: 'array',
        items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' } }, required: ['id'] },
      },
      add_edges: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            target: { type: 'string' },
            weight: { type: 'number' },
            label: { type: 'string' },
          },
          required: ['source', 'target'],
        },
      },
      remove_nodes: { type: 'array', items: { type: 'string' } },
      remove_edges: {
        type: 'array',
        items: { type: 'object', properties: { source: { type: 'string' }, target: { type: 'string' } }, required: ['source', 'target'] },
      },
      update_positions: { type: 'object', description: 'Node positions as { nodeId: { x, y } }' },
    },
  },
}
```

Wire through `handleToolCall` in `agent.js`. The handler should:
1. Apply changes to `session.currentGraph`
2. Send a `update_graph` message to the client
3. Return a summary: `{ added_nodes: [...], added_edges: [...], node_count: N, edge_count: M }`

### Client-side handling

**`client/src/hooks/useTutorState.js`** — Add handler for `update_graph` message type:

```javascript
case 'UPDATE_GRAPH': {
  const graph = state.graph ? { ...state.graph } : { nodes: [], edges: [], positions: {} };
  if (action.add_nodes) {
    graph.nodes = [...graph.nodes, ...action.add_nodes];
  }
  if (action.add_edges) {
    graph.edges = [...graph.edges, ...action.add_edges];
  }
  if (action.remove_nodes) {
    const removeSet = new Set(action.remove_nodes);
    graph.nodes = graph.nodes.filter(n => !removeSet.has(n.id));
    graph.edges = graph.edges.filter(e => !removeSet.has(e.source) && !removeSet.has(e.target));
  }
  if (action.remove_edges) {
    // Remove matching edges
  }
  if (action.update_positions) {
    graph.positions = { ...graph.positions, ...action.update_positions };
  }
  return { ...state, graph, vizPanels: [{ id: 'graph', renderer: 'graph', props: { graph } }] };
}
```

**`client/src/components/renderers/GraphRenderer.jsx`** — The existing `useEffect` that watches `graph` already handles full graph replacement. For incremental updates, add a new `useEffect` that watches for `update_graph` events and uses `cy.add()` / `cy.remove()` instead of rebuilding the whole graph. This preserves the viewport position and any existing highlights.

### Testing
- Paste HW6 P1 (Princeton detour). Agent should have a multi-turn conversation.
- Paste HW6 P5 (EV domination). Agent should guide student to describe expanded state graph.
- Agent should call `create_graph` and `update_graph` incrementally, not all at once.

---

## Phase 2: Conversational Input Mode on the Client

### Goal
Transform the text input from an "interrupt" mechanism into the primary interaction channel during guided mode.

### Files to modify

**`client/src/components/Controls.jsx`:**

When in guided mode, the text input behavior changes:
- Placeholder: "Describe what you're thinking..." (not "Ask a question...")
- Submit sends `guided_message` event (not `interrupt`)
- The input stays active and prominent during the sketch phase
- Speed slider and Pause button are less prominent (move to a collapsed settings area)

```jsx
const handleSubmit = (e) => {
  e.preventDefault();
  if (!question.trim()) return;
  if (mode === 'guided') {
    onGuidedMessage(question.trim());
  } else {
    onInterrupt(question.trim());
  }
  setQuestion('');
};
```

Add a contextual prompt above the input when the agent is waiting for student input:
```jsx
{guidedPrompt && (
  <div className="text-sm text-blue-400 px-1 pb-1">{guidedPrompt}</div>
)}
```

The `guidedPrompt` is set by the agent via a new message type `guided_prompt` (e.g., "What should the nodes in your graph represent?").

**`client/src/hooks/useTutorState.js`:**

Add new state fields and actions:
```javascript
// New state fields
guidedPrompt: null,  // string shown above input as contextual hint

// New action types
case 'SET_GUIDED_PROMPT':
  return { ...state, guidedPrompt: action.prompt };
case 'GUIDED_MESSAGE':
  return {
    ...state,
    segments: [...state.segments, {
      id: 'student_' + Date.now(),
      narration: action.text,
      type: 'student_message',
      active: false,
    }],
  };
```

**`client/src/components/Transcript.jsx`:**

Add styling for `student_message` type segments to differentiate them from agent narration:
```jsx
seg.type === 'student_message'
  ? 'bg-gray-700/50 border border-gray-600 text-gray-200'
  : // ... existing styles
```

Also add a "You:" prefix for student messages, similar to how "You asked:" appears for interrupt questions.

**`server/index.js`:**

Add handler for `guided_message`:
```javascript
case 'guided_message': {
  if (!session.active) return;
  session.guidedMessage = { text: msg.text, timestamp: Date.now() };
  if (session.guidedMessageResolver) {
    session.guidedMessageResolver();
    session.guidedMessageResolver = null;
  }
  break;
}
```

**`client/src/App.jsx`:**

Add the new callback and thread it through:
```javascript
const handleGuidedMessage = useCallback((text) => {
  send({ type: 'guided_message', text });
  processMessage({ type: 'GUIDED_MESSAGE', text });
}, [send, processMessage]);
```

Pass `mode={state.mode}`, `guidedPrompt={state.guidedPrompt}`, and `onGuidedMessage={handleGuidedMessage}` to Controls.

### Testing
- In guided mode, type a message — it should appear in the transcript as a student message and reach the agent as a conversation continuation (not an interrupt).
- The agent should respond naturally to the typed message.
- GuidedOptions (clickable buttons) should still work alongside typed input.

---

## Phase 3: Algorithm Classification Tree

### Goal
Provide a structured decision tree the agent uses to help students identify which algorithm family applies.

### Files to create

**`server/classificationTree.js`:**

```javascript
export const CLASSIFICATION_TREE = {
  root: {
    question: "What kind of output does this problem want?",
    options: [
      { label: "An optimal value (shortest, cheapest, maximum)", next: "optimal" },
      { label: "A yes/no answer or existence proof", next: "decision" },
      { label: "A valid construction (arrangement, schedule, tiling)", next: "construction" },
      { label: "A count of something", next: "counting" },
    ],
  },
  optimal: {
    question: "What structure does the input have?",
    options: [
      { label: "A graph with nodes and edges", next: "graph_optimal" },
      { label: "A sequence of items or decisions", next: "sequence_optimal" },
      { label: "A set of intervals, jobs, or activities", next: "interval_optimal" },
      { label: "A grid or matrix", next: "grid_optimal" },
    ],
  },
  graph_optimal: {
    question: "What are you optimizing?",
    options: [
      { label: "Shortest path from A to B", algorithm: "dijkstra" },
      { label: "Minimum cost to connect all nodes", algorithm: "kruskal" },
      { label: "Maximum flow through a network", algorithm: "maxflow" },
      { label: "Something else on a graph", next: "graph_other" },
    ],
  },
  sequence_optimal: {
    question: "Can you make the choice for each item independently, or does each choice affect future options?",
    options: [
      { label: "Each choice is independent (greedy works)", family: "greedy" },
      { label: "Choices interact — I need to consider combinations", next: "dp_type" },
    ],
  },
  dp_type: {
    question: "How do the subproblems relate?",
    options: [
      { label: "I'm filling a 1D table (one parameter changes)", algorithm: "coin_change" },
      { label: "I'm comparing two sequences", algorithm: "lcs" },
      { label: "I'm choosing items with a capacity constraint", algorithm: "knapsack" },
      { label: "Something more complex", family: "dp_general" },
    ],
  },
  construction: {
    question: "Is there an obvious way to split the problem into smaller pieces?",
    options: [
      { label: "Yes — split in half, solve each, combine", family: "divide_and_conquer" },
      { label: "Yes — make the locally best choice at each step", family: "greedy" },
      { label: "Not obvious", family: "needs_discussion" },
    ],
  },
  // ... more nodes as needed
};
```

The agent prompt references this tree:

```
CLASSIFICATION TREE:
You have access to a decision tree in classificationTree.js. Use it as a guide
when the student doesn't immediately know the algorithm family. Present branches
using send_options. You don't have to follow the tree rigidly — if the student
says "I think this is a shortest path problem," skip ahead.

If the problem doesn't map to any leaf, say so: "This problem doesn't directly
map to an algorithm I can visualize. The closest I can show you is [X]."
```

### Files to modify

**`server/guidedAgent.js`** — Import the tree and include it in the prompt as a reference. The agent reads it but isn't forced to follow it mechanically.

### Testing
- Paste HW7 P3 (conference scheduling DP). Agent should guide through: "optimal value" → "sequence of decisions" → "choices interact" → DP.
- Paste HW3 P2 (mafia game). Agent should guide toward divide-and-conquer.
- If student says "I already know this is Dijkstra," agent should skip classification.

---

## Phase 4: Canonical Example Library

### Goal
Pre-built small examples for each algorithm, used during the "refresh" phase.

### Files to create

**`server/examples/canonicalExamples.js`:**

```javascript
export const CANONICAL_EXAMPLES = {
  dijkstra: {
    core: {
      description: "5-node graph where the shortest path isn't the one with fewest edges",
      input: {
        graph: {
          nodes: [
            { id: 'S', label: 'S' }, { id: 'A', label: 'A' },
            { id: 'B', label: 'B' }, { id: 'C', label: 'C' }, { id: 'T', label: 'T' },
          ],
          edges: [
            { source: 'S', target: 'A', weight: 1 },
            { source: 'S', target: 'B', weight: 4 },
            { source: 'A', target: 'B', weight: 2 },
            { source: 'A', target: 'C', weight: 6 },
            { source: 'B', target: 'T', weight: 3 },
            { source: 'C', target: 'T', weight: 1 },
          ],
          positions: {
            S: { x: 100, y: 200 }, A: { x: 300, y: 100 },
            B: { x: 300, y: 300 }, C: { x: 500, y: 100 }, T: { x: 500, y: 300 },
          },
          directed: true,
        },
        source: 'S',
      },
      teaching_notes: "S→A→B→T (cost 6) beats S→B→T (cost 7) even though it has more edges. S→A→C→T (cost 8) loses despite C→T being cheap — the path TO C is too expensive.",
    },
    pitfall: {
      description: "Graph with a negative-weight-like trap (greedy fails)",
      // ... similar structure
    },
  },
  knapsack: {
    core: {
      description: "3 items where greedy by value/weight ratio gives wrong answer",
      input: {
        items: [
          { name: 'A', weight: 3, value: 4 },
          { name: 'B', weight: 2, value: 3 },
          { name: 'C', weight: 2, value: 3 },
        ],
        capacity: 4,
      },
      teaching_notes: "Greedy picks A (ratio 1.33) but B+C (value 6, weight 4) beats A (value 4, weight 3). This is why we need DP.",
    },
  },
  maxflow: {
    core: {
      description: "Small network where a reverse edge is needed",
      input: {
        graph: {
          nodes: [
            { id: 'S', label: 'S' }, { id: 'A', label: 'A' },
            { id: 'B', label: 'B' }, { id: 'T', label: 'T' },
          ],
          edges: [
            { source: 'S', target: 'A', weight: 3 },
            { source: 'S', target: 'B', weight: 2 },
            { source: 'A', target: 'B', weight: 2 },
            { source: 'A', target: 'T', weight: 2 },
            { source: 'B', target: 'T', weight: 3 },
          ],
          directed: true,
          positions: {
            S: { x: 100, y: 200 }, A: { x: 300, y: 100 },
            B: { x: 300, y: 300 }, T: { x: 500, y: 200 },
          },
        },
        source: 'S', sink: 'T',
      },
      teaching_notes: "First augmenting path S→A→B→T uses all of A→B. Second path must use reverse edge B→A via residual graph to achieve max flow of 5.",
    },
  },
  // Add entries for: bfs, dfs, kruskal, prim, lcs, edit_distance, coin_change, bst_insert, binary_search
};
```

### New tool

Add to `server/tools.js`:

```javascript
{
  name: 'show_canonical_example',
  description: 'Show a pre-built canonical example of an algorithm as a quick refresher. Use during the refresh phase before reduction sketching. The example is small and optimized for illustration.',
  input_schema: {
    type: 'object',
    properties: {
      algorithm: { type: 'string', description: 'Algorithm ID from registry' },
      variant: { type: 'string', enum: ['core', 'pitfall'], description: 'Which example to show' },
    },
    required: ['algorithm'],
  },
}
```

Handler in `agent.js`: loads the canonical example, calls `run_algorithm` internally, returns the trace + teaching notes. The agent then narrates it in compressed form (5-8 segments).

### Prompt additions

```
REFRESH PHASE:
Before starting the refresh, always offer the student a choice:
  send_options({
    prompt: "Want a quick refresher on how Dijkstra works, or should we jump straight to your problem?",
    options: [
      { id: "refresh", label: "Show me a quick example" },
      { id: "skip", label: "I know this, let's go" },
    ]
  })

If they want the refresh, call show_canonical_example and narrate it in 5-8 segments.
Use COMPRESSED pacing — only cover landmark steps, skip routine ones.
End with: "That's the core idea. Now let's apply it to your problem."
```

### Testing
- Select "Show me a quick example" for Dijkstra — should see a compressed 5-8 segment walkthrough on the canonical graph.
- Select "I know this" — should skip directly to reduction sketching.

---

## Phase 5: Graph Auto-Layout for Expanded State Spaces

### Goal
When the agent builds expanded graphs (like vertex×battery for HW6 P5), nodes should be laid out sensibly without the agent needing to manually specify positions.

### Files to create

**`server/graphLayout.js`:**

```javascript
/**
 * Compute grid positions for an expanded state-space graph.
 * Nodes are arranged with the primary dimension along the x-axis
 * and the secondary dimension along the y-axis.
 *
 * @param {Array} nodes - [{ id, primary, secondary }]
 *   primary: the main grouping (e.g., vertex ID)
 *   secondary: the state variable (e.g., battery ID)
 * @param {Object} options - { xSpacing, ySpacing, startX, startY }
 * @returns {Object} positions - { nodeId: { x, y } }
 */
export function layoutExpandedGraph(nodes, options = {}) {
  const {
    xSpacing = 150,
    ySpacing = 80,
    startX = 100,
    startY = 100,
  } = options;

  const primaryValues = [...new Set(nodes.map(n => n.primary))];
  const secondaryValues = [...new Set(nodes.map(n => n.secondary))];

  const positions = {};
  for (const node of nodes) {
    const col = primaryValues.indexOf(node.primary);
    const row = secondaryValues.indexOf(node.secondary);
    positions[node.id] = {
      x: startX + col * xSpacing,
      y: startY + row * ySpacing,
    };
  }

  return positions;
}

/**
 * Simple force-directed-ish layout for small graphs without metadata.
 * Falls back to a circle layout.
 */
export function layoutCircle(nodeIds, options = {}) {
  const { centerX = 400, centerY = 250, radius = 200 } = options;
  const positions = {};
  const n = nodeIds.length;
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    positions[nodeIds[i]] = {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  }
  return positions;
}
```

### Integration

The agent prompt should instruct: "When building an expanded state-space graph, provide `primary` and `secondary` metadata for each node in the `update_graph` call. The system will auto-layout them in a grid."

Modify the `update_graph` handler to accept optional layout hints and call `layoutExpandedGraph` when appropriate.

### Testing
- Build a 3×3 expanded graph (3 vertices × 3 batteries). Nodes should appear in a clean grid.

---

## Phase 6: Verification Against Sample Output

### Goal
When the problem provides sample I/O, check the agent's constructed graph + algorithm produces the right answer.

### New tool

Add to `server/tools.js`:

```javascript
{
  name: 'verify_result',
  description: 'Compare the algorithm result against the expected sample output from the problem. Call this after running the algorithm during the verification phase.',
  input_schema: {
    type: 'object',
    properties: {
      computed_result: { type: 'string', description: 'The result your algorithm produced' },
      expected_result: { type: 'string', description: 'The expected result from the problem statement' },
      tolerance: { type: 'number', description: 'Numerical tolerance for floating point comparisons' },
    },
    required: ['computed_result', 'expected_result'],
  },
}
```

Handler: does string or numerical comparison, returns `{ match: boolean, message: string }`.

### Prompt additions

```
VERIFICATION RULES:
- If the problem includes sample input/output, you MUST call verify_result after running the algorithm.
- If the result DOES NOT MATCH: stop immediately. Tell the student: "Our answer doesn't match
  the expected output. That means my model has a bug." Re-examine your reduction and identify
  the error. Explain it as a teaching moment.
- NEVER rationalize a mismatch. The problem-setter's answer is ground truth.
- If you fix the error, rebuild the graph and re-run.
```

### Client-side

Add a verification indicator in the transcript — a green ✓ or red ✗ badge on the verification segment:

```jsx
{seg.type === 'verification' && (
  <span className={`text-xs font-bold ${seg.match ? 'text-green-400' : 'text-red-400'}`}>
    {seg.match ? '✓ Matches expected output' : '✗ Does not match expected output'}
  </span>
)}
```

### Testing
- HW6 P5 with sample input (3 vertices, answer 0.583333). Correct reduction should match.
- Intentionally build wrong graph — verification should catch the mismatch.

---

## Phase 7: Clickable Graph Element References

### Goal
Let students click a node or edge in the graph to reference it in their typed message.

### Files to modify

**`client/src/components/renderers/GraphRenderer.jsx`:**

Add click handlers to Cytoscape:

```javascript
// After cy initialization
cy.on('tap', 'node', (evt) => {
  const nodeId = evt.target.id();
  onElementClick?.({ type: 'node', id: nodeId, label: `[${nodeId}]` });
});

cy.on('tap', 'edge', (evt) => {
  const source = evt.target.data('source');
  const target = evt.target.data('target');
  onElementClick?.({ type: 'edge', source, target, label: `[${source}→${target}]` });
});
```

Accept `onElementClick` as a new prop.

**`client/src/components/Controls.jsx`:**

Accept `onElementRef` prop. When called, insert the reference label at the cursor position in the input:

```javascript
useEffect(() => {
  if (elementRef) {
    setQuestion(prev => prev + elementRef.label + ' ');
  }
}, [elementRef]);
```

**`client/src/App.jsx`:**

Thread the click event:

```javascript
const [elementRef, setElementRef] = useState(null);

// In GraphRenderer:
<GraphRenderer onElementClick={setElementRef} ... />

// In Controls:
<Controls elementRef={elementRef} ... />
```

### Testing
- Click a node in the graph — its ID appears in the text input as `[A]`
- Click an edge — appears as `[A→B]`
- Type around it: "what if [A→B] had weight 5?" — agent should understand the reference

---

## Phase 8: Scope Boundary Handling

### Goal
Handle problems the tool can't fully solve with graceful degradation.

### New algorithm

**`server/algorithms/math/gcd.js`:**

Implement Euclid's algorithm with trace output. Use the array renderer to show the sequence of (a, b) pairs:

```javascript
export function gcd(a, b) {
  const trace = [];
  trace.push({
    type: 'init',
    description: `Computing GCD(${a}, ${b}) using Euclid's algorithm`,
    a, b,
  });

  while (b !== 0) {
    const remainder = a % b;
    trace.push({
      type: 'step',
      a, b, remainder,
      quotient: Math.floor(a / b),
      description: `${a} = ${Math.floor(a / b)} × ${b} + ${remainder}`,
    });
    a = b;
    b = remainder;
  }

  trace.push({
    type: 'result',
    gcd: a,
    description: `GCD = ${a}`,
  });

  return trace;
}
```

Register in `server/algorithms/registry.js` with renderer `'array'` (show the sequence of values).

### Prompt additions for out-of-scope problems

```
SCOPE BOUNDARIES:
When the problem doesn't map to a visualizable algorithm, be honest and helpful:

- PROOF PROBLEMS: "I can't write proofs, but I can show you a concrete example that
  illustrates the property you need to prove. Seeing WHY it's true often helps you
  figure out HOW to prove it." Then run the relevant algorithm on a small example and
  highlight the invariant.

- LP FORMULATION: "I can't solve linear programs, but I can visualize the underlying
  algorithm this LP relates to." Show the graph/flow problem.

- RECURRENCE/BIG-O: "This is an analytical problem. I can show you the algorithm
  running on different input sizes to build intuition about the growth rate."

- NUMBER THEORY (GCD, primality): "I can step through Euclid's algorithm on concrete
  numbers to show you the pattern."

- NP-COMPLETENESS: "I can't show reductions, but I can show you both problems on small
  instances so you can see the structural similarity."

Always be specific about what you CAN do, not just what you can't.
```

### Testing
- Paste HW1 P3 (prove Big-O definitions equivalent). Agent should acknowledge it's a proof problem and offer concrete examples.
- Paste HW2 P1 (GCD). Agent should run the GCD algorithm with trace.
- Paste HW8 P1 (knapsack LP). Agent should acknowledge LP is out of scope but show the knapsack DP to build intuition.

---

## Build Order

Execute phases in this order, testing after each:

| Order | Phase | Priority | Estimated Effort |
|-------|-------|----------|-----------------|
| 1 | Phase 1 — Agent restructure | Critical | Large (prompt rewrite + session loop) |
| 2 | Phase 2 — Conversational input | Critical | Medium (client + server routing) |
| 3 | Phase 5 — Graph auto-layout | High | Small (utility function) |
| 4 | Phase 3 — Classification tree | High | Small (data + prompt) |
| 5 | Phase 4 — Canonical examples | Medium | Medium (data + tool) |
| 6 | Phase 7 — Clickable references | Medium | Small (click handlers + input) |
| 7 | Phase 6 — Verification | Medium | Small (tool + comparison) |
| 8 | Phase 8 — Scope boundaries + GCD | Low | Small (prompt + one algorithm) |

### Acceptance Criteria Per Phase

**Phase 1:** Paste HW6 P5. Agent has ≥3 back-and-forth exchanges with student. Graph appears incrementally. Agent narrates construction choices.

**Phase 2:** Student types "each node should be a vertex-battery pair" and it appears in transcript as a student message. Agent responds by building nodes.

**Phase 3:** Paste HW7 P3. Agent presents 2-3 classification questions via clickable options. Arrives at "dynamic programming."

**Phase 4:** Agent offers refresher for Dijkstra. Student clicks "show me." Compressed walkthrough plays in ≤8 segments.

**Phase 5:** Expanded 3×3 graph auto-lays out in a grid without manual position specification.

**Phase 6:** After running algorithm on constructed graph, agent compares result to sample output. Mismatch triggers "my model has a bug" response.

**Phase 7:** Click node in graph → ID appears in text input. Type message with reference → agent understands it.

**Phase 8:** Paste HW1 P3 (proof problem). Agent gracefully says it can't prove theorems but offers concrete examples.
