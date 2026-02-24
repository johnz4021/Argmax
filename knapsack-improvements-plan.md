# Knapsack Teaching Improvements — Claude Code Plan

## Context
Argmax is an algorithm teaching app. A user tested the knapsack lesson and identified three key gaps. This plan addresses all three plus a bug fix. Read the full codebase before starting — the architecture spans `server/` (agent loop, algorithms, viz mapper, context panel defaults) and `client/src/` (React renderers, context panels).

## Change 1: Add persistent "Items" context panel

**Problem:** Learners can't remember item weights/values while watching cells fill. They have to mentally track "what does the guitar weigh again?"

**What to do:**
- In `server/contextPanelDefaults.js`, add an `items` panel to the knapsack entry (before `expression` and `decisions`). Type should be `key_value`.
- In `server/vizMapper.js` inside `mapTableStep`, on `init_table` for knapsack: populate the items panel with all items' names, weights, and values from the trace step data. The knapsack trace's `init_table` step includes the `rowLabels` which encode item names — but you'll likely need to also pass the full items array through the trace. Check `server/algorithms/dp/knapsack.js` and add an `items` field to the `init_table` trace step if it's not already there.
- On `consider_item` steps: update the items panel to highlight the current item being considered (set its status to `'highlight'`, others to `'default'`).
- The panel should show something like: `Laptop: w=3, v=4 | Guitar: w=1, v=1 | ...`

## Change 2: Better explanation of what rows and columns mean

**Problem:** Learners read row 2 as "the Guitar row" rather than understanding it means "best solution using items {Laptop, Guitar}." This cumulative nature of rows is the conceptual foundation for the entire DP table and it's underexplained.

**What to do:**
- In the system prompt (`server/agent.js`, the `SYSTEM_PROMPT` string), add an algorithm-specific teaching note for knapsack (similar to the existing Max Flow and Dijkstra notes). It should instruct the agent to:
  1. Before filling any cells, spend a dedicated segment explaining the table axes: "Each row represents the CUMULATIVE set of items available. Row 0 = no items. Row 1 = just the laptop. Row 2 = laptop AND guitar. Row 3 = all three. This is crucial — row 2 isn't just about the guitar, it's about the best you can do when the laptop and guitar are both options."
  2. Explain columns similarly: "Each column is a hypothetical weight limit. Column 3 asks: if your bag could only hold 3 pounds, what's the best value?"
  3. Explicitly walk through the recurrence on the FIRST non-trivial cell (the first cell where the item actually fits and there's a real choice). Point to both dependency cells: "We look UP to the same column in the row above — that's the 'skip this item' option. We look UP and LEFT by the item's weight — that's the 'take this item' option, because taking it uses up some capacity."

This is a prompt-only change. The agent already has the flexibility to narrate however it wants — it just needs stronger guidance for knapsack specifically.

## Change 3: Make dependency arrows more prominent and explained

**Problem:** The recurrence `dp[i][w] = max(dp[i-1][w], dp[i-1][w-wᵢ] + vᵢ)` is shown in the expression panel but the visual connection to specific cells is too fleeting. Learners don't internalize that each cell depends on two specific cells above it.

**What to do:**
- In `server/vizMapper.js`, in the `fill_cell` / `skip_cell` handling for knapsack: the dependency arrows are already emitted via `show_dependency_arrow`. Check that BOTH dependency sources are shown for `fill_cell` steps where `choice === 'take'` — currently it only shows the "from" cell (the one that won). For teaching purposes, show BOTH the skip source `(i-1, w)` and the take source `(i-1, w-weight)` so the learner can see the two options being compared. You can use different styling for the winning vs losing dependency.
- In `client/src/components/renderers/TableRenderer.jsx`: dependency arrows are tracked in state (`depArrows`) but aren't visually rendered — they're stored but there's no SVG/CSS drawing them. Implement a simple visual: either colored cell borders on the source cells, highlighted background on both source cells, or actual SVG arrow lines overlaid on the table. Keep it simple — even just temporarily highlighting the two source cells in different colors (e.g., one orange for "skip option", one cyan for "take option") for 1-2 seconds before the current cell fills would be effective.
- Clear dependency arrows at the start of each new cell fill (they currently accumulate).

## Change 4: Fix unicode escape rendering bug in LogPanel

**Problem:** The decisions log panel shows literal `\u25B6` and `\u2713` text instead of the ▶ and ✓ characters.

**What to do:**
- In `client/src/components/context/LogPanel.jsx`, the prefix characters are written as `\u25B6` and `\u2713` in JSX string literals. Check whether these are actually being escaped somewhere in the pipeline. The code in the file uses them correctly in JSX (`{'\u25B6'}` pattern), so the bug might be in how the log entries' `text` field arrives from the server — the `vizMapper.js` log entries use `✓` and `✗` directly in template strings (e.g., `✓ Add ${step.from}...`). Trace the full path from `vizMapper.js` → WebSocket → client state → LogPanel render and find where the unicode is getting escaped or double-encoded. Fix at the source.

## Testing
After implementing, run the knapsack lesson end-to-end and verify:
1. Items panel visible throughout with all 4 items, current item highlighted
2. Agent narrates table structure (rows = cumulative items, columns = capacities) before filling
3. Dependency cells are visually indicated when filling each cell
4. Log panel shows actual ▶ and ✓ symbols, not escape sequences
