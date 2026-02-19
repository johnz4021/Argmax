import { useEffect, useRef, useState, useCallback } from 'react';
import { registerRenderer, unregisterRenderer } from '../../lib/rendererRegistry';

const CELL_COLORS = {
  empty: 'bg-gray-800 text-gray-500',
  filled: 'bg-gray-700 text-gray-100',
  current: 'bg-blue-600 text-white ring-2 ring-blue-400',
  highlighted: 'bg-yellow-500/60 text-white',
  optimal: 'bg-green-600/70 text-white',
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
        setDepArrows((prev) => [...prev, { from: params.from, to: params.to }]);
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
    snapshotsRef.current.push(takeTableSnapshot());
  }, [segmentCount, takeTableSnapshot]);

  // Handle explanation mode
  useEffect(() => {
    if (explanationMode?.mode && !preExplanationRef.current) {
      preExplanationRef.current = takeTableSnapshot();
    } else if (explanationMode === null && preExplanationRef.current) {
      restoreTableSnapshot(preExplanationRef.current);
      preExplanationRef.current = null;
    }
  }, [explanationMode, takeTableSnapshot, restoreTableSnapshot]);

  return (
    <div className="relative h-full flex flex-col items-center justify-center p-4 overflow-auto">
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
        <div className="overflow-auto max-h-full max-w-full">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="p-1" />
                {colHeaders.map((h, ci) => (
                  <th
                    key={ci}
                    className="px-2 py-1 text-[10px] text-gray-400 font-mono font-normal text-center min-w-[40px] max-w-[80px] truncate"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, ri) => (
                <tr key={ri}>
                  <td className="px-2 py-1 text-[10px] text-gray-400 font-mono text-right max-w-[100px] truncate">
                    {rowHeaders[ri]}
                  </td>
                  {row.map((cell, ci) => {
                    const cls = cellClasses[ri]?.[ci] || 'empty';
                    const colorClass = CELL_COLORS[cls] || CELL_COLORS.empty;
                    return (
                      <td
                        key={ci}
                        className={`px-2 py-1 text-center text-xs font-mono border border-gray-700 min-w-[40px] transition-all duration-300 ${colorClass}`}
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
