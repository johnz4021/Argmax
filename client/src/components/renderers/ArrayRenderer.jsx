import { useEffect, useRef, useState, useCallback } from 'react';
import { registerRenderer, unregisterRenderer } from '../../lib/rendererRegistry';

const CLASS_COLORS = {
  default: 'bg-gray-700 border-gray-600',
  comparing: 'bg-yellow-500/80 border-yellow-400',
  swapping: 'bg-blue-500/80 border-blue-400',
  sorted: 'bg-green-600/80 border-green-500',
  pivot: 'bg-purple-600/80 border-purple-500',
  active: 'bg-blue-500/80 border-blue-400',
  window: 'bg-cyan-600/80 border-cyan-500',
};

export default function ArrayRenderer({
  rendererId = 'array',
  phase,
  explanationMode,
  segmentCount,
}) {
  const [data, setData] = useState([]);
  const [classes, setClasses] = useState([]);
  const [labels, setLabels] = useState([]);
  const [pointers, setPointers] = useState({});
  const [windowRange, setWindowRange] = useState(null);
  const snapshotsRef = useRef([]);
  const preExplanationRef = useRef(null);

  const takeArraySnapshot = useCallback(() => {
    return {
      data: [...data],
      classes: [...classes],
      labels: [...labels],
      pointers: { ...pointers },
      windowRange: windowRange ? { ...windowRange } : null,
    };
  }, [data, classes, labels, pointers, windowRange]);

  const restoreArraySnapshot = useCallback((snap) => {
    if (!snap) return;
    setData(snap.data);
    setClasses(snap.classes);
    setLabels(snap.labels);
    setPointers(snap.pointers);
    setWindowRange(snap.windowRange);
  }, []);

  const applyArrayAction = useCallback((action, params) => {
    switch (action) {
      case 'set_data': {
        const values = params.values || [];
        setData(values);
        setClasses(new Array(values.length).fill('default'));
        setLabels(params.labels || new Array(values.length).fill(''));
        setPointers({});
        setWindowRange(null);
        break;
      }
      case 'highlight': {
        setClasses((prev) => {
          const next = [...prev];
          for (const idx of params.indices || []) {
            if (idx >= 0 && idx < next.length) {
              next[idx] = params.className || 'comparing';
            }
          }
          return next;
        });
        break;
      }
      case 'swap': {
        const { i, j } = params;
        setData((prev) => {
          const next = [...prev];
          [next[i], next[j]] = [next[j], next[i]];
          return next;
        });
        setClasses((prev) => {
          const next = [...prev];
          next[i] = 'swapping';
          next[j] = 'swapping';
          return next;
        });
        break;
      }
      case 'compare': {
        const { i, j } = params;
        setClasses((prev) => {
          const next = prev.map((c) => (c === 'comparing' ? 'default' : c));
          if (i >= 0 && i < next.length) next[i] = 'comparing';
          if (j >= 0 && j < next.length) next[j] = 'comparing';
          return next;
        });
        break;
      }
      case 'partition': {
        const { pivot_index, left, right } = params;
        setClasses((prev) => {
          const next = [...prev];
          for (let k = left; k <= right; k++) {
            if (k >= 0 && k < next.length) {
              next[k] = k === pivot_index ? 'pivot' : 'active';
            }
          }
          return next;
        });
        break;
      }
      case 'place': {
        const { index, value } = params;
        setData((prev) => {
          const next = [...prev];
          if (index >= 0 && index < next.length) next[index] = value;
          return next;
        });
        setClasses((prev) => {
          const next = [...prev];
          if (index >= 0 && index < next.length) next[index] = 'swapping';
          return next;
        });
        break;
      }
      case 'mark_sorted': {
        setClasses((prev) => {
          const next = [...prev];
          for (const idx of params.indices || []) {
            if (idx >= 0 && idx < next.length) {
              next[idx] = 'sorted';
            }
          }
          return next;
        });
        break;
      }
      case 'set_pointer': {
        setPointers((prev) => ({
          ...prev,
          [params.name]: params.index,
        }));
        break;
      }
      case 'clear_pointers': {
        setPointers({});
        break;
      }
      case 'slide_window': {
        setWindowRange({ start: params.start, end: params.end });
        setClasses((prev) => {
          const next = prev.map((c) => (c === 'window' ? 'default' : c));
          for (let k = params.start; k <= params.end && k < next.length; k++) {
            next[k] = 'window';
          }
          return next;
        });
        break;
      }
      case 'set_label': {
        setLabels((prev) => {
          const next = [...prev];
          if (params.index >= 0 && params.index < next.length) {
            next[params.index] = params.label || '';
          }
          return next;
        });
        break;
      }
      case 'reset': {
        setClasses((prev) => prev.map(() => 'default'));
        setPointers({});
        setWindowRange(null);
        setLabels((prev) => prev.map(() => ''));
        break;
      }
    }
  }, []);

  // Register with renderer registry
  useEffect(() => {
    registerRenderer(rendererId, {
      apply: applyArrayAction,
      takeSnapshot: takeArraySnapshot,
      restoreSnapshot: restoreArraySnapshot,
      cleanup: () => {
        setClasses((prev) => prev.map(() => 'default'));
        setPointers({});
        setWindowRange(null);
      },
    });
    return () => unregisterRenderer(rendererId);
  }, [rendererId, applyArrayAction, takeArraySnapshot, restoreArraySnapshot]);

  // Take snapshot after each segment
  useEffect(() => {
    if (segmentCount === undefined || segmentCount === 0 || data.length === 0) return;
    snapshotsRef.current.push(takeArraySnapshot());
  }, [segmentCount, takeArraySnapshot]);

  // Handle explanation mode
  useEffect(() => {
    if (explanationMode?.mode && !preExplanationRef.current) {
      preExplanationRef.current = takeArraySnapshot();
    } else if (explanationMode === null && preExplanationRef.current) {
      restoreArraySnapshot(preExplanationRef.current);
      preExplanationRef.current = null;
    }
  }, [explanationMode, takeArraySnapshot, restoreArraySnapshot]);

  const maxVal = data.length > 0 ? Math.max(...data.map((v) => Math.abs(v)), 1) : 1;

  return (
    <div className="relative h-full flex flex-col items-center justify-center p-6">
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

      {data.length === 0 ? (
        <p className="text-gray-500">Waiting for array data...</p>
      ) : (
        <div className="w-full max-w-3xl">
          {/* Bar chart visualization */}
          <div className="flex items-end justify-center gap-1.5" style={{ height: '250px' }}>
            {data.map((value, idx) => {
              const barHeight = Math.max((Math.abs(value) / maxVal) * 200, 20);
              const colorClass = CLASS_COLORS[classes[idx]] || CLASS_COLORS.default;
              return (
                <div key={idx} className="flex flex-col items-center gap-1" style={{ flex: '1 1 0', maxWidth: '60px' }}>
                  {labels[idx] && (
                    <span className="text-[10px] text-purple-400 truncate max-w-full">
                      {labels[idx]}
                    </span>
                  )}
                  <div
                    className={`w-full rounded-t border-2 flex items-center justify-center transition-all duration-300 ${colorClass}`}
                    style={{ height: `${barHeight}px`, minWidth: '28px' }}
                  >
                    <span className="text-xs font-mono text-white font-bold">{value}</span>
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono">{idx}</span>
                </div>
              );
            })}
          </div>

          {/* Pointers */}
          {Object.keys(pointers).length > 0 && (
            <div className="relative h-8 mt-2">
              {Object.entries(pointers).map(([name, idx]) => {
                if (idx < 0 || idx >= data.length) return null;
                const leftPercent = ((idx + 0.5) / data.length) * 100;
                return (
                  <div
                    key={name}
                    className="absolute text-center transition-all duration-300"
                    style={{ left: `${leftPercent}%`, transform: 'translateX(-50%)' }}
                  >
                    <div className="text-red-400 text-[10px]">▲</div>
                    <div className="text-red-400 text-[10px] font-mono font-bold">{name}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
