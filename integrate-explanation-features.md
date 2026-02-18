# Claude Code Prompt: Integrate Explanation Features into AlgoTutor


I have an existing AlgoTutor app — an AI algorithm tutor with Cytoscape.js visualization, ElevenLabs TTS, and a Claude agent loop. The app already supports basic teaching segments, pause/resume, and simple interrupts via `respond_to_interrupt`.

I need you to integrate a **layered explanation system** so that when a learner asks a clarifying question during an interrupt, the agent can visually explain its answer on the graph without destroying the current algorithm state. There are three explanation modes, and the agent picks the right one based on the question type.

## The Three Explanation Modes

### 1. Overlay Mode ("why this?" / "how does X relate to Y?")
- Dim all nodes/edges NOT relevant to the explanation (opacity ~0.2)
- Spotlight the relevant nodes/edges in place (original positions preserved)
- Add temporary floating annotation labels (CSS-positioned divs over the Cytoscape canvas)
- When done: remove annotations, restore full opacity. Graph state unchanged.

### 2. Rewind Mode ("what just happened?" / "I'm lost")
- Snapshot the current graph state (all classes, labels, data)
- Roll the Cytoscape instance back to a previous step's state
- Replay 1-3 steps slowly with the agent re-narrating
- When done: restore the snapshot so we're back at the current state

### 3. Ghost Alternative Mode ("why not X instead?" / "what if we went through B?")
- Add temporary ghost edges/nodes to the graph showing the alternative path
- Ghost elements use dashed lines, ~30% opacity, muted color
- Show labels comparing costs: "this path: cost 7" vs "chosen path: cost 6"
- Rendered on the SAME graph in the SAME positions (no separate panel)
- When done: remove all ghost elements. Original graph untouched.

## What Needs to Change

### 1. `server/tools.js` — Replace `respond_to_interrupt` with `explain`

Replace the existing `respond_to_interrupt` tool with a new `explain` tool that includes an `explanation_mode` parameter. Keep the tool name `respond_to_interrupt` but add the mode field so it's backward-compatible with the agent loop. The schema should be:

```javascript
{
  name: 'respond_to_interrupt',
  description: 'Respond to a learner question using visual explanation. Pick the right mode based on the question type:\n- "overlay": for "why?" questions — dims irrelevant elements, spotlights relevant ones, adds annotations\n- "rewind": for "what just happened?" — replays recent steps more slowly\n- "ghost_alternative": for "what if?" — shows alternative paths as ghost overlays\nAfter the explanation, continue teaching from where you left off.',
  input_schema: {
    type: 'object',
    properties: {
      answer: { type: 'string', description: 'Spoken answer to the learner' },
      explanation_mode: {
        type: 'string',
        enum: ['overlay', 'rewind', 'ghost_alternative', 'none'],
        description: 'Visual explanation mode. Use "none" for simple verbal answers.'
      },
      overlay: {
        type: 'object',
        description: 'Config for overlay mode. Required when explanation_mode is "overlay".',
        properties: {
          spotlight_nodes: { type: 'array', items: { type: 'string' }, description: 'Node IDs to spotlight' },
          spotlight_edges: {
            type: 'array',
            items: {
              type: 'object',
              properties: { from: { type: 'string' }, to: { type: 'string' } },
              required: ['from', 'to']
            },
            description: 'Edges to spotlight'
          },
          annotations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                target: { type: 'string', description: 'Node or edge ID to anchor to' },
                text: { type: 'string' },
                position: { type: 'string', enum: ['top', 'bottom', 'left', 'right'], description: 'Relative to target' }
              },
              required: ['target', 'text']
            }
          }
        }
      },
      rewind: {
        type: 'object',
        description: 'Config for rewind mode. Required when explanation_mode is "rewind".',
        properties: {
          steps_back: { type: 'number', description: 'How many segments to rewind (1-5)' },
          narration_per_step: {
            type: 'array',
            items: { type: 'string' },
            description: 'Re-narration text for each replayed step, using different/clearer wording'
          }
        }
      },
      ghost_alternative: {
        type: 'object',
        description: 'Config for ghost_alternative mode. Required when explanation_mode is "ghost_alternative".',
        properties: {
          ghost_path: {
            type: 'array',
            items: { type: 'string' },
            description: 'Node IDs forming the alternative path (e.g., ["A", "B", "D"])'
          },
          ghost_label: { type: 'string', description: 'Label for the ghost path (e.g., "cost: 7")' },
          actual_path: {
            type: 'array',
            items: { type: 'string' },
            description: 'Node IDs of the actual chosen path for comparison'
          },
          actual_label: { type: 'string', description: 'Label for the actual path (e.g., "cost: 6")' }
        }
      },
      viz_actions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            action: { type: 'string' },
            node: { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
            label: { type: 'string' },
            path: { type: 'array', items: { type: 'string' } },
            table: { type: 'object' },
            className: { type: 'string' }
          },
          required: ['action']
        },
        description: 'Additional viz actions (same as emit_segment). Applied AFTER explanation mode setup.'
      }
    },
    required: ['answer', 'explanation_mode']
  }
}
```

### 2. `server/agent.js` — Update system prompt and tool handler

**System prompt additions** — append these paragraphs to the existing `SYSTEM_PROMPT`:

```
HANDLING INTERRUPTS:
When a learner interrupts with a question, choose the right explanation_mode:
- "overlay" for "why did we pick X?" or "how does X relate to Y?" — spotlight the relevant nodes/edges, dim everything else, add annotation labels explaining the reasoning
- "rewind" for "what just happened?" or "I'm confused" or "can you repeat that?" — rewind 1-3 steps and re-explain with different, clearer wording
- "ghost_alternative" for "what if we went through B instead?" or "why not this path?" — show the alternative path as a ghost overlay alongside the actual chosen path, with cost labels
- "none" for simple factual questions that don't need visual explanation

After your explanation, emit a bridging segment: "Alright, back to where we were..." and continue the algorithm.

When using overlay mode, be specific about which nodes and edges to spotlight — only the ones directly relevant to the question. Add 1-2 short annotations that explain the key insight.

When using rewind mode, your re-narration should use DIFFERENT words than the original — if the learner didn't understand the first time, repeating the same words won't help. Use simpler language, analogies, or break the step into smaller pieces.

When using ghost_alternative mode, always include both the ghost (rejected) path and the actual (chosen) path so the learner can visually compare costs.
```

**Tool handler update** — in the `handleToolCall` function, update the `respond_to_interrupt` case to pass the full explanation data to the client:

```javascript
case 'respond_to_interrupt': {
  sendJSON(ws, {
    type: 'interrupt_response',
    answer: input.answer,
    explanation_mode: input.explanation_mode || 'none',
    overlay: input.overlay || null,
    rewind: input.rewind || null,
    ghost_alternative: input.ghost_alternative || null,
    viz_actions: input.viz_actions || [],
  });

  const sendBinaryFn = (buffer) => sendBinary(ws, buffer);
  const sendJsonFn = (obj) => sendJSON(ws, obj);
  await synthesizeAndStream(sendBinaryFn, input.answer, session.speedMultiplier, sendJsonFn);

  // If rewind mode, also narrate each replayed step
  if (input.explanation_mode === 'rewind' && input.rewind?.narration_per_step) {
    for (const stepNarration of input.rewind.narration_per_step) {
      await new Promise((r) => setTimeout(r, 800));
      sendJSON(ws, { type: 'rewind_step_narration', narration: stepNarration });
      await synthesizeAndStream(sendBinaryFn, stepNarration, session.speedMultiplier, sendJsonFn);
    }
  }

  // Signal explanation complete so frontend can clean up
  await new Promise((resolve) => setTimeout(resolve, 500));
  sendJSON(ws, { type: 'explanation_complete' });

  return {
    success: true,
    message: 'Interrupt response delivered with explanation. Continue teaching.',
  };
}
```

### 3. `client/src/lib/vizActions.js` — Add snapshot system and new action types

Add these exports to the existing file:

```javascript
// === SNAPSHOT SYSTEM ===

export function takeSnapshot(cy) {
  // Capture full graph state: classes, data, styles for every element
  const snapshot = {
    elements: cy.elements().map((ele) => ({
      group: ele.group(),
      id: ele.id(),
      classes: [...ele.classes()],
      data: { ...ele.data() },
      position: ele.group() === 'nodes' ? { ...ele.position() } : undefined,
    })),
  };
  return snapshot;
}

export function restoreSnapshot(cy, snapshot) {
  // Remove any ghost/temp elements first
  cy.elements('.ghost-temp').remove();
  cy.elements('.annotation-anchor').remove();

  // Restore classes and data for each element
  for (const saved of snapshot.elements) {
    const ele = cy.getElementById(saved.id);
    if (!ele || ele.length === 0) continue;

    // Reset all custom classes
    ele.removeClass('highlighted current visited path ghost examining dimmed spotlit');
    // Reapply saved classes
    for (const cls of saved.classes) {
      ele.addClass(cls);
    }
    // Restore data (especially labels)
    ele.data(saved.data);
  }
}


// === OVERLAY MODE ===

export function applyOverlay(cy, overlay) {
  if (!overlay) return;

  const spotlitNodeIds = new Set(overlay.spotlight_nodes || []);
  const spotlitEdgeKeys = new Set(
    (overlay.spotlight_edges || []).map((e) => `${e.from}-${e.to}`)
  );

  // Dim everything first
  cy.elements().addClass('dimmed');

  // Spotlight specific nodes
  cy.nodes().forEach((n) => {
    if (spotlitNodeIds.has(n.id())) {
      n.removeClass('dimmed');
      n.addClass('spotlit');
    }
  });

  // Spotlight specific edges
  cy.edges().forEach((e) => {
    const key = `${e.data('source')}-${e.data('target')}`;
    if (spotlitEdgeKeys.has(key)) {
      e.removeClass('dimmed');
      e.addClass('spotlit');
    }
  });
}

export function removeOverlay(cy) {
  cy.elements().removeClass('dimmed spotlit');
}


// === GHOST ALTERNATIVE MODE ===

export function applyGhostAlternative(cy, ghostConfig) {
  if (!ghostConfig) return;

  const { ghost_path, ghost_label, actual_path, actual_label } = ghostConfig;

  // Highlight actual path
  if (actual_path && actual_path.length >= 2) {
    for (let i = 0; i < actual_path.length; i++) {
      const node = cy.getElementById(actual_path[i]);
      node.addClass('spotlit');
      if (i < actual_path.length - 1) {
        const edge = cy.edges().filter(
          (e) => e.data('source') === actual_path[i] && e.data('target') === actual_path[i + 1]
        );
        edge.addClass('spotlit');
      }
    }
    // Add label to last node of actual path
    if (actual_label) {
      const lastNode = cy.getElementById(actual_path[actual_path.length - 1]);
      const currentLabel = lastNode.data('label') || lastNode.id();
      lastNode.data('label', `${currentLabel}\n✓ ${actual_label}`);
    }
  }

  // Add ghost path edges (add temporary elements if edges don't exist, or style existing ones)
  if (ghost_path && ghost_path.length >= 2) {
    for (let i = 0; i < ghost_path.length - 1; i++) {
      const existingEdge = cy.edges().filter(
        (e) => e.data('source') === ghost_path[i] && e.data('target') === ghost_path[i + 1]
      );
      if (existingEdge.length > 0) {
        existingEdge.addClass('ghost-alt');
      } else {
        // Add a temporary ghost edge
        cy.add({
          group: 'edges',
          data: {
            id: `ghost-${ghost_path[i]}-${ghost_path[i + 1]}`,
            source: ghost_path[i],
            target: ghost_path[i + 1],
            weight: '',
          },
          classes: 'ghost-alt ghost-temp',
        });
      }
    }
    // Add ghost label
    if (ghost_label) {
      const lastGhostNode = cy.getElementById(ghost_path[ghost_path.length - 1]);
      const currentLabel = lastGhostNode.data('label') || lastGhostNode.id();
      lastGhostNode.data('label', `${currentLabel}\n✗ ${ghost_label}`);
    }
  }

  // Dim non-relevant elements
  const allRelevantIds = new Set([...(ghost_path || []), ...(actual_path || [])]);
  cy.nodes().forEach((n) => {
    if (!allRelevantIds.has(n.id())) {
      n.addClass('dimmed');
    }
  });
}

export function removeGhostAlternative(cy) {
  cy.elements('.ghost-temp').remove();
  cy.elements().removeClass('ghost-alt dimmed spotlit');
}
```

### 4. `client/src/components/GraphView.jsx` — Add snapshot tracking, explanation mode rendering, and annotations

This is the biggest frontend change. The component needs to:

**a) Track snapshots per segment.** Every time a `segment_end` fires, store a snapshot. This powers rewind.

**b) Accept an `explanationMode` prop** and render accordingly:
- Overlay mode: apply dimming + spotlighting + render annotation divs as absolutely-positioned overlays anchored to Cytoscape node positions.
- Ghost mode: add ghost elements.
- Rewind mode: restore an older snapshot, replay actions.

**c) Clean up when explanation ends.** When `explanation_complete` fires, call the appropriate `remove*` function and restore the pre-explanation snapshot.

Add to the CYTOSCAPE_STYLE array:

```javascript
{
  selector: '.dimmed',
  style: { opacity: 0.15 },
},
{
  selector: '.spotlit',
  style: {
    opacity: 1,
    'border-width': 4,
    'border-color': '#60a5fa',
    'z-index': 999,
  },
},
{
  selector: 'edge.spotlit',
  style: {
    opacity: 1,
    'line-color': '#60a5fa',
    'target-arrow-color': '#60a5fa',
    width: 4,
    'z-index': 999,
  },
},
{
  selector: '.ghost-alt',
  style: {
    'line-color': '#f87171',
    'target-arrow-color': '#f87171',
    'line-style': 'dashed',
    opacity: 0.4,
    width: 3,
  },
},
```

Add an **annotations layer** — a div positioned absolutely over the Cytoscape container. For each annotation from the overlay config, use `cy.getElementById(target).renderedPosition()` to get pixel coordinates and render a floating label div at that position. These are React-rendered divs, not Cytoscape elements, so they can contain rich text and style easily. Recompute positions on pan/zoom using a Cytoscape `viewport` event listener.

New props for GraphView:

```jsx
export default function GraphView({ graph, vizActions, phase, explanationMode, onSnapshotTaken }) {
  // ...existing code...
  const snapshotsRef = useRef([]);      // array of snapshots, one per completed segment
  const preExplanationSnapshotRef = useRef(null);  // snapshot taken right before explanation starts
  const [annotations, setAnnotations] = useState([]);  // for overlay annotations

  // Take snapshot after each segment completes (called from parent via callback)
  // ...

  // When explanationMode changes, apply/remove the visual mode
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (explanationMode?.mode === 'overlay') {
      preExplanationSnapshotRef.current = takeSnapshot(cy);
      applyOverlay(cy, explanationMode.config);
      // Compute annotation positions from cy node positions
      if (explanationMode.config?.annotations) {
        const annots = explanationMode.config.annotations.map((a) => {
          const ele = cy.getElementById(a.target);
          const pos = ele.renderedPosition();
          return { ...a, x: pos.x, y: pos.y };
        });
        setAnnotations(annots);
      }
    } else if (explanationMode?.mode === 'ghost_alternative') {
      preExplanationSnapshotRef.current = takeSnapshot(cy);
      applyGhostAlternative(cy, explanationMode.config);
    } else if (explanationMode?.mode === 'rewind') {
      preExplanationSnapshotRef.current = takeSnapshot(cy);
      // Rewind: restore snapshot from N segments ago
      const idx = Math.max(0, snapshotsRef.current.length - (explanationMode.config?.steps_back || 2));
      if (snapshotsRef.current[idx]) {
        restoreSnapshot(cy, snapshotsRef.current[idx]);
      }
    } else if (explanationMode === null && preExplanationSnapshotRef.current) {
      // Explanation ended — restore original state
      removeOverlay(cy);
      removeGhostAlternative(cy);
      restoreSnapshot(cy, preExplanationSnapshotRef.current);
      preExplanationSnapshotRef.current = null;
      setAnnotations([]);
    }
  }, [explanationMode]);
```

Render annotations as an overlay:

```jsx
return (
  <div className="relative h-full">
    {/* ...existing phase label... */}
    <div ref={containerRef} className="w-full h-full" />

    {/* Explanation mode indicator */}
    {explanationMode && (
      <div className="absolute top-3 right-3 z-10 bg-purple-900/90 text-sm text-purple-200 px-3 py-1.5 rounded-lg border border-purple-700 flex items-center gap-2">
        <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
        Explaining...
      </div>
    )}

    {/* Annotation overlays */}
    {annotations.map((ann, i) => (
      <div
        key={i}
        className="absolute z-20 bg-gray-900/95 border border-blue-500 text-blue-200 text-xs px-2 py-1 rounded-md shadow-lg pointer-events-none max-w-[180px]"
        style={{
          left: ann.x + (ann.position === 'right' ? 35 : ann.position === 'left' ? -150 : -40),
          top: ann.y + (ann.position === 'bottom' ? 35 : ann.position === 'top' ? -40 : -10),
        }}
      >
        {ann.text}
      </div>
    ))}
  </div>
);
```

### 5. `client/src/hooks/useTutorState.js` — Add explanation mode state

Add `explanationMode` to state:

```javascript
const initialState = {
  // ...existing fields...
  explanationMode: null,  // null | { mode: 'overlay'|'rewind'|'ghost_alternative', config: {...} }
};
```

Add reducer cases:

```javascript
case 'SET_EXPLANATION_MODE':
  return { ...state, explanationMode: action.explanationMode };

case 'CLEAR_EXPLANATION_MODE':
  return { ...state, explanationMode: null };
```

Update the `INTERRUPT_RESPONSE` case to also set explanation mode:

```javascript
case 'INTERRUPT_RESPONSE':
  return {
    ...state,
    status: 'teaching',
    explanationMode: action.explanation_mode !== 'none' ? {
      mode: action.explanation_mode,
      config: action[action.explanation_mode] || {},
    } : null,
    segments: [
      ...state.segments,
      {
        id: 'ir_' + Date.now(),
        narration: action.answer,
        type: 'answer',
        active: false,
      },
    ],
  };
```

Update `processMessage` to handle the new fields from `interrupt_response`:

```javascript
case 'interrupt_response':
  dispatch({
    type: 'INTERRUPT_RESPONSE',
    answer: msg.answer,
    explanation_mode: msg.explanation_mode || 'none',
    overlay: msg.overlay,
    rewind: msg.rewind,
    ghost_alternative: msg.ghost_alternative,
  });
  break;

case 'explanation_complete':
  dispatch({ type: 'CLEAR_EXPLANATION_MODE' });
  break;
```

### 6. `client/src/App.jsx` — Wire explanation mode through

Pass `explanationMode` from state to `GraphView`:

```jsx
<GraphView
  graph={state.graph}
  vizActions={vizActions}
  phase={state.currentPhase}
  explanationMode={state.explanationMode}
/>
```

Handle the new `explanation_complete` message in the `onMessage` callback:

```javascript
if (msg.type === 'explanation_complete') {
  processMessage(msg);
}
```

Also handle `rewind_step_narration` by adding it to the transcript:

```javascript
if (msg.type === 'rewind_step_narration') {
  processMessage({
    type: 'segment_start',
    segment_id: 'rewind_' + Date.now(),
    narration: msg.narration,
    phase: 'Replaying step...',
    viz_actions: [],
  });
}
```

### 7. `client/src/components/Controls.jsx` — Visual hint during explanation

When `explanationMode` is active, show a subtle indicator that we're in explanation mode. No functional change needed, but add after the interrupt waiting message:

```jsx
{state.explanationMode && (
  <p className="text-sm text-purple-400 flex items-center gap-2">
    <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
    Showing explanation...
  </p>
)}
```

Pass `explanationMode` through as a prop from App or include it in the `status` check.

### 8. Segment Snapshot Tracking

In `App.jsx`, when a `segment_end` message is received, tell GraphView to take a snapshot. The cleanest way: add a `segmentSnapshotTrigger` counter to state that increments on each `segment_end`, and have GraphView's useEffect take a snapshot when it changes. Or expose an imperative `takeSnapshot` method via `useImperativeHandle` on GraphView.

Simpler approach: have GraphView internally listen for segment count changes. Add `segmentCount` to useTutorState, increment on each `SEGMENT_END`, and pass it as a prop to GraphView. GraphView takes a snapshot in a useEffect watching `segmentCount`.

## Summary of Changes

| File | Change |
|------|--------|
| `server/tools.js` | Replace `respond_to_interrupt` schema with enriched version including `explanation_mode`, `overlay`, `rewind`, `ghost_alternative` fields |
| `server/agent.js` | Update SYSTEM_PROMPT with interrupt handling guidance. Update `respond_to_interrupt` handler to send explanation data and `explanation_complete` signal |
| `client/src/lib/vizActions.js` | Add `takeSnapshot`, `restoreSnapshot`, `applyOverlay`, `removeOverlay`, `applyGhostAlternative`, `removeGhostAlternative` exports |
| `client/src/components/GraphView.jsx` | Add `.dimmed`, `.spotlit`, `.ghost-alt` styles. Add snapshot tracking per segment. Add `explanationMode` prop handling. Render annotation overlay divs. |
| `client/src/hooks/useTutorState.js` | Add `explanationMode` to state. Add `SET_EXPLANATION_MODE`, `CLEAR_EXPLANATION_MODE` cases. Enrich `INTERRUPT_RESPONSE` to set explanation mode. Handle `explanation_complete` message. |
| `client/src/App.jsx` | Pass `explanationMode` to GraphView. Handle `explanation_complete` and `rewind_step_narration` in onMessage. |
| `client/src/components/Controls.jsx` | Show visual indicator during active explanation |

## Important Implementation Notes

- **Snapshots must be lightweight.** Only store classes, data, and positions — not the full Cytoscape serialization. The functions in vizActions.js above do this correctly.
- **Annotations must reposition on pan/zoom.** In GraphView, add a Cytoscape `viewport` event listener that recomputes annotation positions from `cy.getElementById(target).renderedPosition()`.
- **Ghost elements need a `ghost-temp` class** so they can be bulk-removed on cleanup without affecting real graph elements.
- **The `explanation_complete` message is the single cleanup trigger.** All three modes clean up the same way: restore the pre-explanation snapshot. This keeps the frontend simple.
- **Rewind replay of viz_actions is optional for v1.** Just rewinding the visual state and re-narrating is enough. You don't need to replay the individual viz_actions frame by frame — the snapshot restoration handles the visual state.
- **Don't modify the existing `emit_segment` or `create_graph` tools.** The explanation system is entirely contained within the interrupt flow.
