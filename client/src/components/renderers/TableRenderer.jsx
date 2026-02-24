import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { registerRenderer, unregisterRenderer } from '../../lib/rendererRegistry';

const CELL_COLORS = {
  empty: 'bg-gray-800 text-gray-500',
  filled: 'bg-gray-700 text-gray-100',
  current: 'bg-blue-600 text-white ring-2 ring-blue-400',
  highlighted: 'bg-yellow-500/60 text-white',
  optimal: 'bg-green-600/70 text-white',
  'dep-skip': 'bg-orange-500/40 text-white ring-2 ring-orange-400',
  'dep-take': 'bg-cyan-500/40 text-white ring-2 ring-cyan-400',
};

export default function TableRenderer({
  rendererId = 'table',
  phase,
  explanationMode,
  segmentCount,
}) {
  const [grid, setGrid] = useState([]);
  const [cellClasses, setCellClasses] = useState([]);
  const [rowHeaders, setRowHeaders] = useState([]);
  const [colHeaders, setColHeaders] = useState([]);
  const [depArrows, setDepArrows] = useState([]);
  const [overlayState, setOverlayState] = useState(null);
  const snapshotsRef = useRef([]);
  const preExplanationRef = useRef(null);

  const takeTableSnapshot = useCallback(() => {
    return {
      grid: grid.map((r) => [...r]),
      cellClasses: cellClasses.map((r) => [...r]),
      rowHeaders: [...rowHeaders],
      colHeaders: [...colHeaders],
      depArrows: depArrows.map((a) => ({ ...a })),
    };
  }, [grid, cellClasses, rowHeaders, colHeaders, depArrows]);

  const restoreTableSnapshot = useCallback((snap) => {
    if (!snap) return;
    setGrid(snap.grid);
    setCellClasses(snap.cellClasses);
    setRowHeaders(snap.rowHeaders);
    setColHeaders(snap.colHeaders);
    setDepArrows(snap.depArrows);
  }, []);

  const applyTableAction = useCallback((action, params) => {
    console.log(`[TableRenderer] applyTableAction: ${action}`, params);
    switch (action) {
      case 'init_grid': {
        const rows = params.rows || 0;
        const cols = params.cols || 0;
        setGrid(Array.from({ length: rows }, () => new Array(cols).fill(null)));
        setCellClasses(Array.from({ length: rows }, () => new Array(cols).fill('empty')));
        setRowHeaders(params.row_headers || Array.from({ length: rows }, (_, i) => `${i}`));
        setColHeaders(params.col_headers || Array.from({ length: cols }, (_, i) => `${i}`));
        setDepArrows([]);
        break;
      }
      case 'fill_cell': {
        const { row, col, value, className } = params;
        setGrid((prev) => {
          const next = prev.map((r) => [...r]);
          if (next[row]) next[row][col] = value;
          return next;
        });
        setCellClasses((prev) => {
          const next = prev.map((r) => [...r]);
          if (next[row]) next[row][col] = className || 'filled';
          return next;
        });
        break;
      }
      case 'highlight_cell': {
        const { row, col, className } = params;
        setCellClasses((prev) => {
          const next = prev.map((r) => [...r]);
          if (next[row]) next[row][col] = className || 'current';
          return next;
        });
        break;
      }
      case 'highlight_row': {
        const { row } = params;
        setCellClasses((prev) => {
          const next = prev.map((r) => [...r]);
          if (next[row]) {
            next[row] = next[row].map((c) => (c === 'empty' || c === 'filled' ? 'highlighted' : c));
          }
          return next;
        });
        break;
      }
      case 'highlight_col': {
        const { col } = params;
        setCellClasses((prev) => {
          const next = prev.map((r) => [...r]);
          for (let i = 0; i < next.length; i++) {
            if (next[i] && (next[i][col] === 'empty' || next[i][col] === 'filled')) {
              next[i][col] = 'highlighted';
            }
          }
          return next;
        });
        break;
      }
      case 'show_dependency_arrow': {
        setDepArrows((prev) => [...prev, { from: params.from, to: params.to, role: params.role }]);
        break;
      }
      case 'clear_dependency_arrows': {
        setDepArrows([]);
        break;
      }
      case 'set_row_header': {
        setRowHeaders((prev) => {
          const next = [...prev];
          next[params.row] = params.label;
          return next;
        });
        break;
      }
      case 'set_col_header': {
        setColHeaders((prev) => {
          const next = [...prev];
          next[params.col] = params.label;
          return next;
        });
        break;
      }
      case 'mark_optimal': {
        setCellClasses((prev) => {
          const next = prev.map((r) => [...r]);
          for (const { row, col } of params.cells || []) {
            if (next[row]) next[row][col] = 'optimal';
          }
          return next;
        });
        break;
      }
      case 'reset': {
        setCellClasses((prev) => prev.map((r) => r.map(() => 'empty')));
        setGrid((prev) => prev.map((r) => r.map(() => null)));
        setDepArrows([]);
        break;
      }
    }
  }, []);

  // Register with renderer registry
  useEffect(() => {
    registerRenderer(rendererId, {
      apply: applyTableAction,
      takeSnapshot: takeTableSnapshot,
      restoreSnapshot: restoreTableSnapshot,
      cleanup: () => {
        setDepArrows([]);
        setCellClasses((prev) => prev.map((r) => r.map((c) => (c === 'current' || c === 'highlighted' ? 'filled' : c))));
      },
    });
    return () => unregisterRenderer(rendererId);
  }, [rendererId, applyTableAction, takeTableSnapshot, restoreTableSnapshot]);

  // Take snapshot after each segment
  useEffect(() => {
    if (segmentCount === undefined || segmentCount === 0 || grid.length === 0) return;
    if (explanationMode?.mode === 'rewind') return;
    snapshotsRef.current.push(takeTableSnapshot());
  }, [segmentCount, takeTableSnapshot, explanationMode]);

  // Handle explanation mode
  useEffect(() => {
    if (explanationMode?.mode === 'rewind') {
      preExplanationRef.current = takeTableSnapshot();
      const stepsBack = explanationMode.config?.steps_back || 2;
      const idx = Math.max(0, snapshotsRef.current.length - stepsBack);
      if (snapshotsRef.current[idx]) {
        restoreTableSnapshot(snapshotsRef.current[idx]);
      }
    } else if (explanationMode?.mode === 'overlay') {
      preExplanationRef.current = takeTableSnapshot();
      const config = explanationMode.config;
      const spotlit = new Set((config.spotlight_cells || []).map(c => `${c.row}-${c.col}`));
      setOverlayState({ spotlit, annotations: config.annotations || [] });
    } else if (explanationMode === null && preExplanationRef.current) {
      setOverlayState(null);
      restoreTableSnapshot(preExplanationRef.current);
      preExplanationRef.current = null;
    }
  }, [explanationMode, takeTableSnapshot, restoreTableSnapshot]);

  // Build a lookup for dependency arrow source cells → role
  const depSourceMap = useMemo(() => {
    const map = {};
    for (const arrow of depArrows) {
      const key = `${arrow.from.row}-${arrow.from.col}`;
      map[key] = arrow.role || 'skip';
    }
    return map;
  }, [depArrows]);

  return (
    <div className="relative h-full flex flex-col items-center justify-center p-8 overflow-auto">
      {phase && (
        <div className="absolute top-3 left-3 z-10 bg-gray-800/90 text-sm text-blue-300 px-3 py-1.5 rounded-lg border border-gray-700">
          {phase}
        </div>
      )}

      {explanationMode && (
        <div className="absolute top-3 right-3 z-10 bg-purple-900/90 text-sm text-purple-200 px-3 py-1.5 rounded-lg border border-purple-700 flex items-center gap-2">
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
          Explaining...
        </div>
      )}

      {grid.length === 0 ? (
        <p className="text-gray-500">Waiting for table data...</p>
      ) : (
        <div className="relative overflow-auto max-h-full w-full flex items-center justify-center">
          {/* Overlay annotations */}
          {overlayState?.annotations?.map((ann, i) => {
            const target = ann.target;
            let row, col;
            if (typeof target === 'object' && target.row !== undefined) {
              row = target.row;
              col = target.col;
            } else if (typeof target === 'string' && target.includes('-')) {
              [row, col] = target.split('-').map(Number);
            }
            if (row === undefined || col === undefined) return null;
            const cols = grid[0]?.length || 1;
            const rows = grid.length || 1;
            const leftPct = ((col + 1.5) / (cols + 1)) * 100;
            const topPct = ((row + 1.5) / (rows + 1)) * 100;
            return (
              <div key={i}
                className="absolute z-20 bg-gray-900/95 border border-blue-500 text-blue-200 text-sm px-3 py-2 rounded-md shadow-lg pointer-events-none max-w-[240px]"
                style={{
                  left: `${leftPct}%`, top: `${topPct}%`,
                  transform: 'translate(-50%, -50%)',
                }}>
                {ann.text}
              </div>
            );
          })}
          <table className="border-collapse w-full max-w-4xl">
            <thead>
              <tr>
                <th className="p-1" />
                {colHeaders.map((h, ci) => (
                  <th
                    key={ci}
                    className="px-4 py-3 text-sm text-gray-400 font-mono font-normal text-center truncate"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, ri) => (
                <tr key={ri}>
                  <td className="px-4 py-3 text-sm text-gray-400 font-mono text-right whitespace-nowrap">
                    {rowHeaders[ri]}
                  </td>
                  {row.map((cell, ci) => {
                    const cls = cellClasses[ri]?.[ci] || 'empty';
                    const cellKey = `${ri}-${ci}`;
                    // Apply dependency highlight if this cell is a source and not current/optimal
                    const depRole = depSourceMap[cellKey];
                    const effectiveCls = depRole && (cls === 'filled' || cls === 'empty')
                      ? `dep-${depRole}`
                      : cls;
                    const colorClass = CELL_COLORS[effectiveCls] || CELL_COLORS.empty;
                    const isDimmed = overlayState && !overlayState.spotlit.has(cellKey);
                    const isSpotlit = overlayState?.spotlit.has(cellKey);
                    return (
                      <td
                        key={ci}
                        className={`px-5 py-4 text-center text-base font-mono border border-gray-700 transition-all duration-300 ${colorClass} ${isDimmed ? 'opacity-[0.15]' : ''} ${isSpotlit ? 'ring-2 ring-blue-400' : ''}`}
                      >
                        {cell !== null ? cell : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
