import { useEffect, useRef, useState, useCallback } from 'react';
import { registerRenderer, unregisterRenderer } from '../../lib/rendererRegistry';

const NODE_COLORS = {
  default: 'bg-gray-700 border-gray-500',
  highlighted: 'bg-yellow-500/80 border-yellow-400',
  current: 'bg-blue-500/80 border-blue-400',
  inserted: 'bg-green-500/80 border-green-400',
  deleted: 'bg-red-500/50 border-red-400 opacity-50',
  reversed: 'bg-purple-500/80 border-purple-400',
};

export default function LinkedRenderer({
  rendererId = 'linked',
  phase,
  explanationMode,
  segmentCount,
}) {
  const [nodes, setNodes] = useState([]);
  const [classes, setClasses] = useState([]);
  const [pointers, setPointers] = useState({});
  const [mode, setMode] = useState('list'); // 'list' | 'stack' | 'queue'
  const snapshotsRef = useRef([]);
  const preExplanationRef = useRef(null);

  const takeLinkedSnapshot = useCallback(() => {
    return {
      nodes: [...nodes],
      classes: [...classes],
      pointers: { ...pointers },
      mode,
    };
  }, [nodes, classes, pointers, mode]);

  const restoreLinkedSnapshot = useCallback((snap) => {
    if (!snap) return;
    setNodes(snap.nodes);
    setClasses(snap.classes);
    setPointers(snap.pointers);
    setMode(snap.mode);
  }, []);

  const applyLinkedAction = useCallback((action, params) => {
    switch (action) {
      case 'set_list': {
        const values = params.values || [];
        setNodes(values);
        setClasses(new Array(values.length).fill('default'));
        setPointers({});
        setMode(params.mode || 'list');
        break;
      }
      case 'highlight_node': {
        setClasses((prev) => {
          const next = [...prev];
          const idx = typeof params.index === 'number' ? params.index : nodes.indexOf(params.value);
          if (idx >= 0 && idx < next.length) {
            next[idx] = params.className || 'highlighted';
          }
          return next;
        });
        break;
      }
      case 'highlight_pointer': {
        setPointers((prev) => ({
          ...prev,
          [params.name]: { index: params.index, highlighted: true },
        }));
        break;
      }
      case 'insert_after': {
        const idx = params.index;
        setNodes((prev) => {
          const next = [...prev];
          next.splice(idx + 1, 0, params.value);
          return next;
        });
        setClasses((prev) => {
          const next = [...prev];
          next.splice(idx + 1, 0, 'inserted');
          return next;
        });
        break;
      }
      case 'delete_node': {
        const idx = params.index;
        setClasses((prev) => {
          const next = [...prev];
          if (idx >= 0 && idx < next.length) next[idx] = 'deleted';
          return next;
        });
        // Remove after animation delay
        setTimeout(() => {
          setNodes((prev) => prev.filter((_, i) => i !== idx));
          setClasses((prev) => prev.filter((_, i) => i !== idx));
        }, 400);
        break;
      }
      case 'reverse_segment': {
        const { start, end } = params;
        setNodes((prev) => {
          const next = [...prev];
          const segment = next.slice(start, end + 1).reverse();
          for (let i = start; i <= end; i++) {
            next[i] = segment[i - start];
          }
          return next;
        });
        setClasses((prev) => {
          const next = [...prev];
          for (let i = start; i <= end; i++) {
            next[i] = 'reversed';
          }
          return next;
        });
        break;
      }
      case 'push': {
        setNodes((prev) => [params.value, ...prev]);
        setClasses((prev) => ['inserted', ...prev]);
        break;
      }
      case 'pop': {
        setClasses((prev) => {
          const next = [...prev];
          if (next.length > 0) next[0] = 'deleted';
          return next;
        });
        setTimeout(() => {
          setNodes((prev) => prev.slice(1));
          setClasses((prev) => prev.slice(1));
        }, 400);
        break;
      }
      case 'enqueue': {
        setNodes((prev) => [...prev, params.value]);
        setClasses((prev) => [...prev, 'inserted']);
        break;
      }
      case 'dequeue': {
        setClasses((prev) => {
          const next = [...prev];
          if (next.length > 0) next[0] = 'deleted';
          return next;
        });
        setTimeout(() => {
          setNodes((prev) => prev.slice(1));
          setClasses((prev) => prev.slice(1));
        }, 400);
        break;
      }
      case 'set_pointer': {
        setPointers((prev) => ({
          ...prev,
          [params.name]: { index: params.index, highlighted: false },
        }));
        break;
      }
      case 'reset': {
        setClasses((prev) => prev.map(() => 'default'));
        setPointers({});
        break;
      }
    }
  }, [nodes]);

  // Register with renderer registry
  useEffect(() => {
    registerRenderer(rendererId, {
      apply: applyLinkedAction,
      takeSnapshot: takeLinkedSnapshot,
      restoreSnapshot: restoreLinkedSnapshot,
      cleanup: () => {
        setClasses((prev) => prev.map(() => 'default'));
        setPointers({});
      },
    });
    return () => unregisterRenderer(rendererId);
  }, [rendererId, applyLinkedAction, takeLinkedSnapshot, restoreLinkedSnapshot]);

  // Take snapshot after each segment
  useEffect(() => {
    if (segmentCount === undefined || segmentCount === 0 || nodes.length === 0) return;
    snapshotsRef.current.push(takeLinkedSnapshot());
  }, [segmentCount, takeLinkedSnapshot]);

  // Handle explanation mode
  useEffect(() => {
    if (explanationMode?.mode && !preExplanationRef.current) {
      preExplanationRef.current = takeLinkedSnapshot();
    } else if (explanationMode === null && preExplanationRef.current) {
      restoreLinkedSnapshot(preExplanationRef.current);
      preExplanationRef.current = null;
    }
  }, [explanationMode, takeLinkedSnapshot, restoreLinkedSnapshot]);

  const isVertical = mode === 'stack';

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

      {nodes.length === 0 ? (
        <p className="text-gray-500">Waiting for linked structure data...</p>
      ) : (
        <div className="w-full max-w-3xl">
          {/* Mode label */}
          <div className="text-xs text-gray-500 uppercase tracking-wide mb-3 text-center">
            {mode === 'stack' ? 'Stack (top →)' : mode === 'queue' ? 'Queue (front → rear)' : 'Linked List (head → tail)'}
          </div>

          {/* Nodes chain */}
          <div className={`flex ${isVertical ? 'flex-col' : 'flex-row flex-wrap'} items-center justify-center gap-1`}>
            {nodes.map((value, idx) => {
              const colorClass = NODE_COLORS[classes[idx]] || NODE_COLORS.default;
              return (
                <div key={`${idx}-${value}`} className="flex items-center gap-1">
                  <div
                    className={`flex items-center justify-center rounded-lg border-2 px-4 py-2 min-w-[48px] transition-all duration-300 ${colorClass}`}
                  >
                    <span className="text-sm font-mono text-white font-bold">{value}</span>
                  </div>
                  {idx < nodes.length - 1 && (
                    <span className={`text-gray-500 text-lg ${isVertical ? 'rotate-90' : ''}`}>→</span>
                  )}
                </div>
              );
            })}
            <span className="text-gray-600 text-sm ml-1">null</span>
          </div>

          {/* Pointers */}
          {Object.keys(pointers).length > 0 && (
            <div className="flex justify-center gap-4 mt-3">
              {Object.entries(pointers).map(([name, ptr]) => (
                <span
                  key={name}
                  className={`text-[11px] font-mono ${ptr.highlighted ? 'text-red-400' : 'text-gray-400'}`}
                >
                  {name}: [{ptr.index}]
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
