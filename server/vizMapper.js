/**
 * Deterministic trace-step → viz_actions mapper.
 *
 * Given a trace step from any algorithm, produce the exact viz_actions
 * and context panel updates the client needs.  The agent no longer has
 * to construct these — it just references trace step indices.
 */

// ─── helpers ──────────────────────────────────────────────────────────────────

function viz(renderer, action, params = {}) {
  return { renderer, action, params };
}

function ctx(action, params) {
  return { renderer: 'context', action, params };
}

function ctxUpdate(panelId, data) {
  return ctx('update', { panel_id: panelId, ...data });
}

function ctxLog(panelId, text, type = 'info') {
  return ctx('append_log', { panel_id: panelId, entries: [{ text, type }] });
}

/**
 * Build a tree structure from a heap array for the tree renderer.
 */
function heapToTree(heap) {
  if (!heap || heap.length === 0) return { nodes: [], edges: [], root: null, heap_array: heap };
  const nodes = heap.map((v, i) => ({ id: `n${i}`, value: v }));
  const edges = [];
  for (let i = 0; i < heap.length; i++) {
    const l = 2 * i + 1;
    const r = 2 * i + 2;
    if (l < heap.length) edges.push({ from: `n${i}`, to: `n${l}`, side: 'left' });
    if (r < heap.length) edges.push({ from: `n${i}`, to: `n${r}`, side: 'right' });
  }
  return { nodes, edges, root: 'n0', heap_array: heap };
}

// ─── main entry ───────────────────────────────────────────────────────────────

/**
 * @param {string}  algorithm    – e.g. 'dijkstra', 'knapsack'
 * @param {string}  rendererType – 'graph' | 'array' | 'table' | 'tree' | 'linked'
 * @param {object}  step         – a single trace step object
 * @param {object}  state        – mutable mapper state (persists across steps)
 * @returns {{ viz: object[], ctx: object[] }}
 */
export function mapTraceStep(algorithm, rendererType, step, state) {
  switch (rendererType) {
    case 'graph':  return mapGraphStep(algorithm, step, state);
    case 'array':  return mapArrayStep(algorithm, step, state);
    case 'table':  return mapTableStep(algorithm, step, state);
    case 'tree':   return mapTreeStep(algorithm, step, state);
    case 'linked': return mapLinkedStep(algorithm, step, state);
    default:       return { viz: [], ctx: [] };
  }
}

// ─── GRAPH mapper ─────────────────────────────────────────────────────────────

function mapGraphStep(algo, step, state) {
  const v = [];
  const c = [];

  switch (step.type) {
    // ── shared: dijkstra / bfs / dfs ──────────────────────────────────────
    case 'init': {
      if (algo === 'dijkstra' && step.distances) {
        c.push(ctxUpdate('distances', {
          entries: Object.entries(step.distances).map(([k, d]) => ({
            key: k, value: d === Infinity ? '∞' : d, status: 'default',
          })),
        }));
        c.push(ctxUpdate('pq', { items: [], style: 'queue' }));
      } else if (algo === 'bfs') {
        c.push(ctxUpdate('queue', {
          items: (step.queue || []).map((n) => ({ value: n })),
          style: 'queue',
        }));
        c.push(ctxUpdate('visited', { items: [], style: 'set' }));
      } else if (algo === 'dfs') {
        c.push(ctxUpdate('visited', { items: [], style: 'set' }));
      } else if (algo === 'kruskal') {
        c.push(ctxUpdate('mst_weight', { entries: [{ key: 'Total weight', value: 0 }] }));
      } else if (algo === 'prim' && step.keys) {
        c.push(ctxUpdate('keys', {
          entries: Object.entries(step.keys).map(([k, d]) => ({
            key: k, value: d === Infinity ? '∞' : d, status: 'default',
          })),
        }));
      } else if (algo === 'maxflow') {
        // Set initial edge labels
        if (step.edge_labels) {
          for (const el of step.edge_labels) {
            v.push(viz('graph', 'update_edge_label', { from: el.from, to: el.to, label: el.label, directed_only: true }));
          }
        }
        c.push(ctxUpdate('flow_status', {
          entries: [
            { key: 'Total flow', value: step.total_flow ?? 0 },
            { key: 'Status', value: 'Searching for augmenting paths' },
          ],
        }));
      }
      break;
    }

    case 'visit_node': {
      v.push(viz('graph', 'mark_current', { node: step.node }));

      if (algo === 'dijkstra') {
        if (step.distances) {
          c.push(ctxUpdate('distances', {
            entries: Object.entries(step.distances).map(([k, d]) => ({
              key: k,
              value: d === Infinity ? '∞' : d,
              status: k === step.node ? 'highlight' : (step.visited?.includes(k) ? 'default' : 'default'),
            })),
          }));
        }
        if (step.visited) {
          c.push(ctxUpdate('pq', {
            items: step.visited.map((n) => ({ value: n, status: n === step.node ? 'active' : 'default' })),
            style: 'queue',
          }));
        }
      } else if (algo === 'bfs') {
        if (step.queue) {
          c.push(ctxUpdate('queue', {
            items: step.queue.map((n) => ({ value: n })),
            style: 'queue',
          }));
        }
        if (step.visited) {
          c.push(ctxUpdate('visited', {
            items: step.visited.map((n) => ({ value: n, status: n === step.node ? 'added' : 'default' })),
            style: 'set',
          }));
        }
      } else if (algo === 'dfs') {
        if (step.visited) {
          c.push(ctxUpdate('visited', {
            items: step.visited.map((n) => ({ value: n, status: n === step.node ? 'added' : 'default' })),
            style: 'set',
          }));
        }
      } else if (algo === 'prim') {
        if (step.parent) {
          v.push(viz('graph', 'highlight_edge', { from: step.parent, to: step.node, className: 'mst-edge' }));
        }
        if (step.mst_edges) {
          state.mstWeight = step.mst_edges.reduce((s, e) => s + e.weight, 0);
        }
      }
      break;
    }

    case 'examine_edge': {
      v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.to, className: 'examining' }));
      break;
    }

    case 'relax': {
      v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.to, className: 'highlighted' }));
      v.push(viz('graph', 'set_label', { node: step.to, label: String(step.new_distance) }));
      if (step.distances) {
        c.push(ctxUpdate('distances', {
          entries: Object.entries(step.distances).map(([k, d]) => ({
            key: k,
            value: d === Infinity ? '∞' : d,
            status: k === step.to ? 'updated' : 'default',
          })),
        }));
      }
      break;
    }

    case 'discover': {
      v.push(viz('graph', 'highlight_node', { node: step.node, className: 'highlighted' }));
      if (step.from) {
        v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.node }));
      }
      if (step.queue) {
        c.push(ctxUpdate('queue', {
          items: step.queue.map((n) => ({ value: n, status: n === step.node ? 'added' : 'default' })),
          style: 'queue',
        }));
      }
      if (step.visited) {
        c.push(ctxUpdate('visited', {
          items: step.visited.map((n) => ({ value: n })),
          style: 'set',
        }));
      }
      break;
    }

    case 'backtrack': {
      v.push(viz('graph', 'mark_visited', { node: step.node }));
      break;
    }

    case 'result': {
      if (algo === 'dijkstra' && step.paths) {
        // Show shortest path tree
        for (const [target, path] of Object.entries(step.paths)) {
          if (path.length > 1) {
            v.push(viz('graph', 'show_path', { path }));
          }
        }
      }
      if (algo === 'maxflow') {
        c.push(ctxUpdate('flow_status', {
          entries: [
            { key: 'Max flow', value: step.max_flow, status: 'updated' },
            { key: 'Min cut', value: step.min_cut, status: 'updated' },
          ],
        }));
      }
      break;
    }

    // ── Kruskal-specific ─────────────────────────────────────────────────
    case 'sort_edges': {
      c.push(ctxLog('decisions', 'Edges sorted by weight', 'info'));
      break;
    }

    case 'consider_edge': {
      v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.to, className: 'examining' }));
      c.push(ctxLog('decisions', `Consider ${step.from}-${step.to} (w=${step.weight})`, 'info'));
      break;
    }

    case 'check_cycle': {
      const msg = step.would_cycle
        ? `${step.from}-${step.to} would form a cycle`
        : `${step.from}-${step.to} is safe (different components)`;
      c.push(ctxLog('decisions', msg, 'info'));
      break;
    }

    case 'add_to_mst': {
      v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.to, className: 'mst-edge' }));
      c.push(ctxUpdate('mst_weight', {
        entries: [{ key: 'Total weight', value: step.mst_weight, status: 'updated' }],
      }));
      c.push(ctxLog('decisions', `✓ Add ${step.from}-${step.to} (w=${step.weight}), total=${step.mst_weight}`, 'result'));
      break;
    }

    case 'reject_edge': {
      v.push(viz('graph', 'highlight_edge', { from: step.from, to: step.to, className: 'strikethrough' }));
      c.push(ctxLog('decisions', `✗ Reject ${step.from}-${step.to} (would cycle)`, 'decision'));
      break;
    }

    // ── Prim-specific ────────────────────────────────────────────────────
    case 'update_key': {
      v.push(viz('graph', 'set_label', { node: step.node, label: String(step.new_key) }));
      if (step.keys) {
        c.push(ctxUpdate('keys', {
          entries: Object.entries(step.keys).map(([k, d]) => ({
            key: k,
            value: d === Infinity ? '∞' : d,
            status: k === step.node ? 'updated' : 'default',
          })),
        }));
      }
      c.push(ctxLog('decisions', `Update key[${step.node}] = ${step.new_key} via ${step.via}`, 'decision'));
      break;
    }

    // ── Max Flow specific ────────────────────────────────────────────────
    case 'find_augmenting_path': {
      v.push(viz('graph', 'reset_highlights', {}));
      if (step.path) {
        for (const node of step.path) {
          v.push(viz('graph', 'highlight_node', { node, className: 'augmenting' }));
        }
        for (let i = 0; i < step.path.length - 1; i++) {
          v.push(viz('graph', 'highlight_edge', { from: step.path[i], to: step.path[i + 1], className: 'augmenting' }));
        }
      }
      c.push(ctxUpdate('flow_status', {
        entries: [
          { key: 'Total flow', value: step.total_flow },
          { key: 'Path bottleneck', value: step.bottleneck, status: 'highlight' },
        ],
      }));
      c.push(ctxLog('aug_paths', `Path ${step.iteration}: ${step.path?.join(' → ')} (bottleneck=${step.bottleneck})`, 'decision'));
      break;
    }

    case 'push_flow': {
      v.push(viz('graph', 'reset_highlights', {}));
      // Highlight the augmenting path that was just used
      if (step.path) {
        for (const node of step.path) {
          v.push(viz('graph', 'highlight_node', { node, className: 'augmenting' }));
        }
        for (let i = 0; i < step.path.length - 1; i++) {
          v.push(viz('graph', 'highlight_edge', { from: step.path[i], to: step.path[i + 1], className: 'augmenting' }));
        }
      }
      if (step.edge_labels) {
        for (const el of step.edge_labels) {
          v.push(viz('graph', 'update_edge_label', { from: el.from, to: el.to, label: el.label, directed_only: true }));
          if (el.saturated) {
            v.push(viz('graph', 'highlight_edge', { from: el.from, to: el.to, className: 'saturated' }));
          }
        }
      }
      c.push(ctxUpdate('flow_status', {
        entries: [
          { key: 'Total flow', value: step.total_flow, status: 'updated' },
          { key: 'Status', value: `Pushed ${step.bottleneck} units` },
        ],
      }));
      break;
    }

    case 'no_more_paths': {
      c.push(ctxLog('aug_paths', 'No more augmenting paths found', 'info'));
      c.push(ctxUpdate('flow_status', {
        entries: [
          { key: 'Total flow', value: step.total_flow, status: 'updated' },
          { key: 'Status', value: 'Complete' },
        ],
      }));
      break;
    }

    case 'compute_min_cut': {
      if (step.source_side) {
        for (const node of step.source_side) {
          v.push(viz('graph', 'highlight_node', { node, className: 'source-side' }));
        }
      }
      if (step.sink_side) {
        for (const node of step.sink_side) {
          v.push(viz('graph', 'highlight_node', { node, className: 'sink-side' }));
        }
      }
      if (step.cut_edges) {
        for (const e of step.cut_edges) {
          v.push(viz('graph', 'highlight_edge', { from: e.from, to: e.to, className: 'min-cut' }));
        }
      }
      break;
    }
  }

  return { viz: v, ctx: c };
}

// ─── ARRAY mapper ─────────────────────────────────────────────────────────────

function mapArrayStep(algo, step, state) {
  const v = [];
  const c = [];

  switch (step.type) {
    case 'init': {
      if (step.array) {
        v.push(viz('array', 'set_data', { values: step.array }));
      }
      if (!state.comparisons) state.comparisons = 0;
      if (!state.swaps) state.swaps = 0;
      if (algo === 'binary_search' && step.target !== undefined) {
        state.target = step.target;
        c.push(ctxUpdate('bounds', {
          entries: [
            { key: 'Target', value: step.target },
            { key: 'Left', value: 0 },
            { key: 'Right', value: step.array.length - 1 },
          ],
        }));
      } else {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Comparisons', value: 0 },
            { key: 'Swaps', value: 0 },
          ],
        }));
      }
      break;
    }

    case 'compare': {
      state.comparisons = (state.comparisons || 0) + 1;
      if (step.indices) {
        v.push(viz('array', 'compare', { i: step.indices[0], j: step.indices[1] }));
      }
      if (algo !== 'binary_search') {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Comparisons', value: state.comparisons },
            { key: 'Swaps', value: state.swaps || 0 },
          ],
        }));
      }
      break;
    }

    case 'swap': {
      state.swaps = (state.swaps || 0) + 1;
      v.push(viz('array', 'swap', { i: step.i, j: step.j }));
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Comparisons', value: state.comparisons || 0 },
          { key: 'Swaps', value: state.swaps },
        ],
      }));
      break;
    }

    case 'place': {
      v.push(viz('array', 'place', { index: step.index, value: step.value }));
      break;
    }

    case 'select_pivot': {
      v.push(viz('array', 'partition', {
        pivot_index: step.pivot_index,
        left: step.range?.[0] ?? 0,
        right: step.range?.[1] ?? 0,
      }));
      break;
    }

    case 'pivot_placed':
    case 'mark_sorted': {
      if (step.indices) {
        v.push(viz('array', 'mark_sorted', { indices: step.indices }));
      } else if (step.index !== undefined) {
        v.push(viz('array', 'mark_sorted', { indices: [step.index] }));
      }
      break;
    }

    case 'select_key': {
      v.push(viz('array', 'highlight', { indices: [step.index], className: 'active' }));
      break;
    }

    case 'insert': {
      // Insertion sort: update the array and highlight placed element
      if (step.array) {
        v.push(viz('array', 'set_data', { values: step.array }));
      }
      v.push(viz('array', 'place', { index: step.index, value: step.value }));
      break;
    }

    case 'divide': {
      v.push(viz('array', 'highlight', {
        indices: Array.from({ length: step.range[1] - step.range[0] + 1 }, (_, i) => step.range[0] + i),
        className: 'active',
      }));
      break;
    }

    case 'merge_start': {
      const range = step.range;
      v.push(viz('array', 'highlight', {
        indices: Array.from({ length: range[1] - range[0] + 1 }, (_, i) => range[0] + i),
        className: 'comparing',
      }));
      break;
    }

    case 'merge_complete': {
      if (step.array) {
        v.push(viz('array', 'set_data', { values: step.array }));
      }
      break;
    }

    // ── Binary search ────────────────────────────────────────────────────
    case 'check_mid': {
      state.comparisons = (state.comparisons || 0) + 1;
      v.push(viz('array', 'set_pointer', { name: 'left', index: step.left }));
      v.push(viz('array', 'set_pointer', { name: 'right', index: step.right }));
      v.push(viz('array', 'set_pointer', { name: 'mid', index: step.mid }));
      v.push(viz('array', 'highlight', { indices: [step.mid], className: 'comparing' }));
      c.push(ctxUpdate('bounds', {
        entries: [
          { key: 'Target', value: state.target },
          { key: 'Left', value: step.left },
          { key: 'Right', value: step.right },
          { key: 'Mid', value: step.mid, status: 'highlight' },
          { key: 'Value at mid', value: step.value },
        ],
      }));
      break;
    }

    case 'eliminate_left': {
      v.push(viz('array', 'set_pointer', { name: 'left', index: step.mid + 1 }));
      break;
    }

    case 'eliminate_right': {
      v.push(viz('array', 'set_pointer', { name: 'right', index: step.mid - 1 }));
      break;
    }

    case 'found': {
      v.push(viz('array', 'mark_sorted', { indices: [step.index] }));
      c.push(ctxUpdate('bounds', {
        entries: [
          { key: 'Target', value: step.value },
          { key: 'Found at', value: step.index, status: 'updated' },
        ],
      }));
      break;
    }

    // ── Selection sort ───────────────────────────────────────────────────
    case 'scan_start': {
      v.push(viz('array', 'highlight', { indices: [step.index], className: 'active' }));
      break;
    }

    case 'new_min': {
      v.push(viz('array', 'highlight', { indices: [step.index], className: 'comparing' }));
      break;
    }

    // ── informational ────────────────────────────────────────────────────
    case 'pass_start':
    case 'early_exit':
    case 'recurse':
      break;

    case 'result':
      if (step.array) {
        v.push(viz('array', 'set_data', { values: step.array }));
        v.push(viz('array', 'mark_sorted', {
          indices: step.array.map((_, i) => i),
        }));
      }
      break;
  }

  return { viz: v, ctx: c };
}

// ─── TABLE mapper ─────────────────────────────────────────────────────────────

function mapTableStep(algo, step, state) {
  const v = [];
  const c = [];

  switch (step.type) {
    case 'init_table': {
      if (step.rows !== undefined && step.cols !== undefined) {
        // 2D table (knapsack, lcs, edit_distance)
        v.push(viz('table', 'init_grid', {
          rows: step.rows,
          cols: step.cols,
          row_headers: step.rowLabels,
          col_headers: step.colLabels,
        }));
        // Fill initial values if table provided
        if (step.table) {
          for (let r = 0; r < step.table.length; r++) {
            for (let cl = 0; cl < step.table[r].length; cl++) {
              if (step.table[r][cl] !== 0 && step.table[r][cl] !== undefined) {
                v.push(viz('table', 'fill_cell', { row: r, col: cl, value: step.table[r][cl] }));
              }
            }
          }
        }
      } else if (step.size !== undefined) {
        // 1D table (coin_change) — display as a single row
        v.push(viz('table', 'init_grid', {
          rows: 1,
          cols: step.size,
          col_headers: Array.from({ length: step.size }, (_, i) => String(i)),
        }));
        if (step.table) {
          for (let i = 0; i < step.table.length; i++) {
            if (step.table[i] !== undefined) {
              v.push(viz('table', 'fill_cell', {
                row: 0,
                col: i,
                value: step.table[i] === Infinity ? '∞' : step.table[i],
              }));
            }
          }
        }
      }

      // Set initial recurrence expression
      if (algo === 'knapsack') {
        c.push(ctxUpdate('expression', {
          expression: 'dp[i][w] = max(dp[i-1][w], dp[i-1][w-wᵢ] + vᵢ)',
        }));
      } else if (algo === 'lcs') {
        c.push(ctxUpdate('expression', {
          expression: 'dp[i][j] = dp[i-1][j-1]+1 if match, else max(dp[i-1][j], dp[i][j-1])',
        }));
      } else if (algo === 'edit_distance') {
        c.push(ctxUpdate('expression', {
          expression: 'dp[i][j] = min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost)',
        }));
      } else if (algo === 'coin_change') {
        c.push(ctxUpdate('expression', {
          expression: 'dp[a] = min(dp[a], dp[a-coin] + 1)',
        }));
      }
      break;
    }

    case 'consider_item': {
      v.push(viz('table', 'highlight_row', { row: step.row }));
      if (step.item) {
        c.push(ctxUpdate('expression', {
          expression: `Considering item "${step.item.name}" (w=${step.item.weight}, v=${step.item.value})`,
        }));
      }
      break;
    }

    case 'compare_chars': {
      v.push(viz('table', 'highlight_cell', { row: step.row, col: step.col, className: 'current' }));
      const matchStr = step.match ? 'Match!' : 'No match';
      c.push(ctxUpdate('expression', {
        expression: `Compare '${step.char1}' vs '${step.char2}': ${matchStr}`,
      }));
      break;
    }

    case 'fill_cell':
    case 'skip_cell': {
      const isCoinChange = algo === 'coin_change';
      const row = isCoinChange ? 0 : step.row;
      const col = isCoinChange ? step.index : step.col;
      const value = step.value === Infinity ? '∞' : step.value;

      v.push(viz('table', 'fill_cell', { row, col, value }));
      v.push(viz('table', 'highlight_cell', { row, col, className: 'current' }));

      // Show dependency arrows
      if (step.from && Array.isArray(step.from)) {
        for (const src of step.from) {
          v.push(viz('table', 'show_dependency_arrow', {
            from: { row: isCoinChange ? 0 : src.row, col: isCoinChange ? src.index : src.col },
            to: { row, col },
          }));
        }
      }

      // Update expression context
      if (algo === 'knapsack') {
        if (step.choice === 'take') {
          c.push(ctxUpdate('expression', {
            expression: `dp[${step.row}][${step.col}] = max(${step.withoutItem}, ${step.withItem}) = ${step.value}`,
            highlight_terms: [String(step.value)],
            result: step.value,
          }));
          c.push(ctxLog('decisions', `Take item: dp[${step.row}][${step.col}] = ${step.value}`, 'decision'));
        } else {
          c.push(ctxUpdate('expression', {
            expression: `dp[${step.row}][${step.col}] = dp[${step.row - 1}][${step.col}] = ${step.value}`,
            result: step.value,
          }));
          c.push(ctxLog('decisions', `Skip: dp[${step.row}][${step.col}] = ${step.value}`, 'info'));
        }
      } else if (algo === 'lcs') {
        if (step.action === 'match') {
          c.push(ctxUpdate('expression', {
            expression: `dp[${step.row}][${step.col}] = dp[${step.row - 1}][${step.col - 1}] + 1 = ${step.value}`,
            result: step.value,
          }));
          c.push(ctxLog('decisions', `Match → dp[${step.row}][${step.col}] = ${step.value}`, 'decision'));
        } else {
          c.push(ctxUpdate('expression', {
            expression: `dp[${step.row}][${step.col}] = max(${step.fromTop ?? '?'}, ${step.fromLeft ?? '?'}) = ${step.value}`,
            result: step.value,
          }));
          c.push(ctxLog('decisions', `No match → dp[${step.row}][${step.col}] = ${step.value}`, 'info'));
        }
      } else if (algo === 'edit_distance') {
        const op = step.operation || 'match';
        c.push(ctxUpdate('expression', {
          expression: `dp[${step.row}][${step.col}] = ${step.value} (${op})`,
          result: step.value,
        }));
        c.push(ctxLog('decisions', `${op}: dp[${step.row}][${step.col}] = ${step.value}`, op === 'match' ? 'info' : 'decision'));
      } else if (algo === 'coin_change') {
        if (step.kept) {
          c.push(ctxLog('decisions', `dp[${step.index}] stays ${value}`, 'info'));
        } else {
          c.push(ctxUpdate('expression', {
            expression: `dp[${step.index}] = dp[${step.fromIndex}] + 1 = ${value}`,
            result: value,
          }));
          c.push(ctxLog('decisions', `Use coin ${step.coin}: dp[${step.index}] = ${value}`, 'decision'));
        }
      }
      break;
    }

    case 'consider_coin': {
      if (step.coin !== undefined) {
        c.push(ctxUpdate('expression', {
          expression: `Considering coin = ${step.coin}`,
        }));
      }
      break;
    }

    case 'traceback': {
      const isCoinChange = algo === 'coin_change';
      const row = isCoinChange ? 0 : step.row;
      const col = isCoinChange ? step.amount : step.col;

      v.push(viz('table', 'highlight_cell', { row, col, className: 'optimal' }));

      if (algo === 'knapsack') {
        const action = step.included ? `Include "${step.item?.name}"` : 'Skip';
        c.push(ctxLog('decisions', `Traceback [${step.row}][${step.col}]: ${action}`, 'result'));
      } else if (algo === 'lcs') {
        const action = step.action === 'match_diagonal'
          ? `Match '${step.char}' ↖`
          : step.action === 'move_up' ? '↑' : '←';
        c.push(ctxLog('decisions', `Traceback [${step.row}][${step.col}]: ${action}`, 'result'));
      } else if (algo === 'edit_distance') {
        c.push(ctxLog('decisions', `Traceback [${step.row}][${step.col}]: ${step.operation}`, 'result'));
      } else if (algo === 'coin_change') {
        c.push(ctxLog('decisions', `Traceback: use coin ${step.coin}`, 'result'));
      }
      break;
    }

    case 'result': {
      if (step.table) {
        // Mark all cells with final optimal highlights if available
      }
      break;
    }
  }

  return { viz: v, ctx: c };
}

// ─── TREE mapper ──────────────────────────────────────────────────────────────

function mapTreeStep(algo, step, state) {
  const v = [];
  const c = [];

  switch (step.type) {
    case 'init': {
      if (algo === 'bst_insert') {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Values to insert', value: step.values?.join(', ') || '' },
            { key: 'Inserted', value: 0 },
          ],
        }));
      }
      break;
    }

    case 'insert_start': {
      if (algo === 'bst_insert') {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Inserting', value: step.value, status: 'highlight' },
          ],
        }));
      }
      break;
    }

    case 'compare': {
      // BST traversal comparison
      v.push(viz('tree', 'highlight_node', { id: step.node_id, className: 'comparing' }));
      if (algo === 'bst_insert') {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Inserting', value: step.insert_value },
            { key: 'Compare with', value: `${step.node_value} → go ${step.direction}`, status: 'highlight' },
          ],
        }));
      }
      break;
    }

    case 'insert': {
      // BST node inserted
      if (step.tree) {
        v.push(viz('tree', 'set_tree', step.tree));
      }
      v.push(viz('tree', 'highlight_node', { id: step.node_id, className: 'inserted' }));
      if (!state.insertCount) state.insertCount = 0;
      state.insertCount++;
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Inserted', value: `${step.value} (total: ${state.insertCount})`, status: 'updated' },
        ],
      }));
      break;
    }

    // ── Heap operations ──────────────────────────────────────────────────
    case 'place': {
      if (step.heap) {
        v.push(viz('tree', 'set_tree', heapToTree(step.heap)));
        v.push(viz('tree', 'highlight_node', { id: `n${step.index}`, className: 'inserted' }));
        c.push(ctxUpdate('heap_array', {
          items: step.heap.map((val, i) => ({
            value: val,
            status: i === step.index ? 'added' : 'default',
          })),
        }));
      }
      break;
    }

    case 'sift_compare': {
      v.push(viz('tree', 'highlight_node', { id: `n${step.child_index}`, className: 'comparing' }));
      v.push(viz('tree', 'highlight_node', { id: `n${step.parent_index}`, className: 'comparing' }));
      v.push(viz('tree', 'highlight_edge', {
        from: `n${step.parent_index}`,
        to: `n${step.child_index}`,
        className: 'highlighted',
      }));
      break;
    }

    case 'sift_swap': {
      if (step.heap) {
        v.push(viz('tree', 'set_tree', heapToTree(step.heap)));
        v.push(viz('tree', 'highlight_node', { id: `n${step.j}`, className: 'sifting' }));
        c.push(ctxUpdate('heap_array', {
          items: step.heap.map((val, i) => ({
            value: val,
            status: (i === step.i || i === step.j) ? 'active' : 'default',
          })),
        }));
      }
      break;
    }

    case 'sift_done': {
      if (step.heap) {
        v.push(viz('tree', 'set_tree', heapToTree(step.heap)));
        v.push(viz('tree', 'highlight_node', { id: `n${step.index}`, className: 'inserted' }));
        c.push(ctxUpdate('heap_array', {
          items: step.heap.map((val) => ({ value: val })),
        }));
      }
      break;
    }

    case 'extract_start': {
      v.push(viz('tree', 'highlight_node', { id: 'n0', className: 'current' }));
      break;
    }

    case 'extract_swap': {
      if (step.heap) {
        v.push(viz('tree', 'set_tree', heapToTree(step.heap)));
        v.push(viz('tree', 'highlight_node', { id: 'n0', className: 'sifting' }));
        c.push(ctxUpdate('heap_array', {
          items: step.heap.map((val, i) => ({
            value: val,
            status: i === 0 ? 'active' : 'default',
          })),
        }));
      }
      break;
    }

    case 'extract_remove': {
      if (step.heap) {
        v.push(viz('tree', 'set_tree', heapToTree(step.heap)));
        c.push(ctxUpdate('heap_array', {
          items: step.heap.map((val) => ({ value: val })),
        }));
      }
      break;
    }

    case 'result': {
      v.push(viz('tree', 'reset', {}));
      if (step.tree) {
        v.push(viz('tree', 'set_tree', step.tree));
      } else if (step.heap) {
        v.push(viz('tree', 'set_tree', heapToTree(step.heap)));
      }
      break;
    }
  }

  return { viz: v, ctx: c };
}

// ─── LINKED mapper ────────────────────────────────────────────────────────────

function mapLinkedStep(algo, step, state) {
  const v = [];
  const c = [];

  switch (step.type) {
    case 'init': {
      const mode = algo === 'stack_operations' ? 'stack'
        : algo === 'queue_operations' ? 'queue'
        : 'list';
      const values = step.list || step.stack || step.queue || [];
      v.push(viz('linked', 'set_list', { values, mode }));

      if (algo === 'linked_list_reversal') {
        c.push(ctxUpdate('pointers', {
          entries: [
            { key: 'prev', value: 'null' },
            { key: 'current', value: values[0] ?? 'null' },
            { key: 'next', value: values[1] ?? 'null' },
          ],
        }));
      } else if (algo === 'stack_operations') {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Size', value: values.length },
            { key: 'Top', value: values[0] ?? 'empty' },
          ],
        }));
      } else if (algo === 'queue_operations') {
        c.push(ctxUpdate('stats', {
          entries: [
            { key: 'Size', value: values.length },
            { key: 'Front', value: values[0] ?? 'empty' },
            { key: 'Rear', value: values[values.length - 1] ?? 'empty' },
          ],
        }));
      }
      break;
    }

    case 'set_pointers': {
      if (step.prev !== undefined) v.push(viz('linked', 'set_pointer', { name: 'prev', index: step.prev }));
      if (step.current !== undefined) v.push(viz('linked', 'set_pointer', { name: 'current', index: step.current }));
      if (step.next !== undefined) v.push(viz('linked', 'set_pointer', { name: 'next', index: step.next }));
      c.push(ctxUpdate('pointers', {
        entries: [
          { key: 'prev', value: step.prev ?? 'null' },
          { key: 'current', value: step.current ?? 'null' },
          { key: 'next', value: step.next ?? 'null' },
        ],
      }));
      break;
    }

    case 'step': {
      v.push(viz('linked', 'highlight_node', { index: step.current, className: 'current' }));
      v.push(viz('linked', 'set_pointer', { name: 'prev', index: step.prev }));
      v.push(viz('linked', 'set_pointer', { name: 'current', index: step.current }));
      v.push(viz('linked', 'set_pointer', { name: 'next', index: step.next }));
      c.push(ctxUpdate('pointers', {
        entries: [
          { key: 'prev', value: step.prev ?? 'null', status: 'highlight' },
          { key: 'current', value: step.current ?? 'null', status: 'highlight' },
          { key: 'next', value: step.next ?? 'null', status: 'highlight' },
        ],
      }));
      break;
    }

    case 'advance': {
      if (step.partial_result) {
        v.push(viz('linked', 'reverse_segment', { start: 0, end: step.partial_result.length - 1 }));
      }
      v.push(viz('linked', 'set_pointer', { name: 'current', index: step.new_current }));
      break;
    }

    case 'push': {
      v.push(viz('linked', 'push', { value: step.value }));
      v.push(viz('linked', 'highlight_node', { index: 0, className: 'inserted' }));
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Size', value: step.stack?.length ?? '?' },
          { key: 'Top', value: step.value, status: 'updated' },
          { key: 'Operation', value: `push(${step.value})`, status: 'highlight' },
        ],
      }));
      break;
    }

    case 'pop': {
      v.push(viz('linked', 'highlight_node', { index: 0, className: 'deleted' }));
      v.push(viz('linked', 'pop', {}));
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Size', value: step.stack?.length ?? '?' },
          { key: 'Popped', value: step.value, status: 'updated' },
          { key: 'Top', value: step.stack?.[0] ?? 'empty' },
        ],
      }));
      break;
    }

    case 'pop_empty': {
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Size', value: 0 },
          { key: 'Operation', value: 'pop() — empty!', status: 'highlight' },
        ],
      }));
      break;
    }

    case 'enqueue': {
      v.push(viz('linked', 'enqueue', { value: step.value }));
      const q = step.queue || [];
      v.push(viz('linked', 'highlight_node', { index: q.length - 1, className: 'inserted' }));
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Size', value: q.length },
          { key: 'Front', value: q[0] ?? 'empty' },
          { key: 'Rear', value: step.value, status: 'updated' },
        ],
      }));
      break;
    }

    case 'dequeue': {
      v.push(viz('linked', 'highlight_node', { index: 0, className: 'deleted' }));
      v.push(viz('linked', 'dequeue', {}));
      const q = step.queue || [];
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Size', value: q.length },
          { key: 'Dequeued', value: step.value, status: 'updated' },
          { key: 'Front', value: q[0] ?? 'empty' },
        ],
      }));
      break;
    }

    case 'dequeue_empty': {
      c.push(ctxUpdate('stats', {
        entries: [
          { key: 'Size', value: 0 },
          { key: 'Operation', value: 'dequeue() — empty!', status: 'highlight' },
        ],
      }));
      break;
    }

    case 'peek': {
      if (step.value !== null && step.value !== undefined) {
        v.push(viz('linked', 'highlight_node', { index: 0, className: 'highlighted' }));
      }
      break;
    }

    case 'result': {
      v.push(viz('linked', 'reset', {}));
      const values = step.list || step.stack || step.queue || [];
      if (values.length > 0) {
        const mode = algo === 'stack_operations' ? 'stack'
          : algo === 'queue_operations' ? 'queue'
          : 'list';
        v.push(viz('linked', 'set_list', { values, mode }));
      }
      break;
    }
  }

  return { viz: v, ctx: c };
}
