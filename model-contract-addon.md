# Model Contract Phase — Add-on Plan

## Context

This builds on the guided problem-solving mode. After the AI analyzes a problem and before it presents hints or runs any algorithm, it must produce and display a **Model Contract** — an explicit statement of what the algorithm's state, transitions, costs, and constraints are. This catches wrong reductions before they become confident wrong explanations.

Read `server/guidedAgent.js` (the guided agent and its system prompt) and `client/src/components/context/KeyValuePanel.jsx` before starting.

---

## Change 1: Add Model Contract fields to `plan_guided_session` tool

**Where:** `server/guidedAgent.js`, in the `plan_guided_session` tool schema

**What to do:**

Add four required fields to the tool's `input_schema.properties`:

```json
"model_contract": {
  "type": "object",
  "properties": {
    "state_definition": {
      "type": "string",
      "description": "What information must be tracked to make optimal decisions? E.g. '(current_node, battery_origin)' or '(current_node, remaining_capacity)'"
    },
    "transition_rules": {
      "type": "string",
      "description": "What actions are allowed? When can you move, swap, pick up? E.g. 'Move along any edge if current battery has enough remaining capacity. Swap battery only at vertices.'"
    },
    "cost_model": {
      "type": "string",
      "description": "What determines cost and how does it accumulate? Is cost local to each edge or state-dependent? E.g. 'Time = distance / speed of CURRENT battery (not source vertex). Accumulated additively along path.'"
    },
    "feasibility_constraints": {
      "type": "string",
      "description": "What makes a move illegal? E.g. 'Total distance driven on one battery cannot exceed its capacity c_i. Must reach vertex N.'"
    },
    "assumptions_to_verify": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Explicit list of assumptions the reduction makes that could be wrong. E.g. ['Battery is swapped at every vertex', 'Cost depends only on source vertex, not battery origin', 'Capacity only limits single edges, not multi-edge segments']"
    }
  },
  "required": ["state_definition", "transition_rules", "cost_model", "feasibility_constraints", "assumptions_to_verify"]
}
```

Add `"model_contract"` to the top-level `required` array of the tool.

---

## Change 2: Add counterexample self-check to the system prompt

**Where:** `server/guidedAgent.js`, in the `GUIDED_SYSTEM_PROMPT` string

**What to add** (insert after the ANALYZE phase instructions, before IDENTIFY):

```
PHASE 1.5 — MODEL CONTRACT & SELF-CHECK:
After planning the session, you MUST produce a Model Contract. This is non-negotiable.
Fill out ALL of these fields honestly:
- State definition: what must be tracked?
- Transition rules: what moves are legal?
- Cost model: what determines cost? Is it local to each edge or does it depend on 
  carried state (e.g., which battery you're holding)?
- Feasibility constraints: what makes a move illegal?
- Assumptions: list every simplifying assumption your reduction makes.

Then SELF-CHECK: For each assumption, try to construct a small counterexample (4-5 nodes)
where the assumption fails. If you find one, REVISE your reduction before proceeding.
Do not present a reduction you cannot defend.

Common modeling traps to watch for:
- "Cost depends on source vertex" vs "cost depends on current carried state"
- "Constraint applies per-edge" vs "constraint spans multiple edges"  
- "Greedy swap at every vertex" vs "optimal to skip intermediate swaps"
- "Standard edge weights" vs "weights require precomputation (e.g., all-pairs distances)"

If your self-check reveals the reduction is wrong or uncertain, say so explicitly. 
Present the corrected model, or if you can't find one, tell the student: "The full 
reduction for this problem is subtle — here's what I'm confident about, and here's 
where the modeling gets tricky." Partial honesty beats confident wrongness.
```

---

## Change 3: Display the Model Contract to the student

**What:** After the AI produces the contract, show it as a context panel so the student can see and challenge the assumptions. Then narrate it and ask the student if they agree.

**Where:** `server/guidedAgent.js` (in the Phase 1.5 handler), client uses existing context panel infrastructure

**What to do on the server:**

After `plan_guided_session` returns, extract the `model_contract` and:

1. Send a `create_visualization` message with a context panel for the contract:
```js
sendJSON(ws, {
  type: 'create_visualization',
  panels: [],
  context_panels: [
    {
      id: 'model_contract',
      type: 'key_value',
      title: 'Model Contract',
      initial_data: {
        layout: 'table',
        entries: [
          { key: 'State', value: contract.state_definition },
          { key: 'Transitions', value: contract.transition_rules },
          { key: 'Cost model', value: contract.cost_model },
          { key: 'Constraints', value: contract.feasibility_constraints },
        ],
      },
    },
    {
      id: 'assumptions',
      type: 'log',
      title: 'Assumptions to Verify',
      initial_data: {
        entries: contract.assumptions_to_verify.map(a => ({
          text: a,
          type: 'decision',
        })),
      },
    },
  ],
});
```

2. Emit a segment narrating the contract: "Before we dive in, let me lay out what I think the model looks like..." Walk through each field.

3. After narrating, use `send_options` to ask: "Does this capture all the constraints from the problem? Or did I miss something?"
   - Options: "Looks right", "I think you're missing something", "I'm not sure"
   - If student says missing something → ask what, revise model
   - If student says looks right or not sure → proceed, but the assumptions panel stays visible throughout

**On the client side:** No new components needed. The `key_value` panel with `layout: 'table'` already renders multi-row contract-style data. The `log` panel already renders the assumptions list. Both are visible in `ContextPanelHost` throughout the session.

---

## Change 4: Confidence calibration in narration

**Where:** `server/guidedAgent.js`, in the system prompt

**What to add** (append to the existing GUARDRAILS section):

```
CONFIDENCE CALIBRATION:
- If the reduction is a single well-known transformation (e.g., "run Dijkstra on the 
  given graph with weight = edge_weight"), narrate confidently.
- If the reduction involves multiple steps (e.g., "compute all-pairs shortest distances, 
  then build a derived graph, then run Dijkstra on that"), explicitly walk through WHY 
  each step is valid. Say "this is a multi-step reduction, so let me justify each piece."
- If you revised your model during self-check, tell the student: "I initially thought X, 
  but that misses Y constraint. Here's the corrected approach." This is a teaching moment,
  not a failure.
- When assumptions are unverified (e.g., the self-check was inconclusive), use hedged 
  language: "I believe this is correct, but the [specific assumption] is worth double-
  checking against edge cases."
```

---

## File Summary

| File | Action | What |
|------|--------|------|
| `server/guidedAgent.js` | Modify | Add model_contract to plan_guided_session schema, add Phase 1.5 to system prompt, add contract display logic, add confidence calibration to guardrails |

All changes are in one file. No new components, no client modifications — it uses existing context panel rendering.

## Testing Checklist

- [ ] Paste EV Domination problem → model contract shows "state = (node, battery origin)" and assumptions list includes "battery spans multiple edges" → reduction uses all-pairs distances, not naive per-edge weights
- [ ] Paste standard Dijkstra problem (no tricky reduction) → model contract is simple, assumptions list is short, AI narrates confidently without hedging
- [ ] Paste a problem where AI's first reduction is wrong → self-check catches it → AI revises and explains the correction to the student
- [ ] Model Contract panel and Assumptions panel both visible in the sidebar throughout the session
- [ ] Student clicks "I think you're missing something" → AI asks what and incorporates feedback
- [ ] Multi-step reduction → AI says "this is multi-step, let me justify each piece" rather than presenting it as obvious
