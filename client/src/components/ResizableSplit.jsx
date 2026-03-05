import { useState, useRef, useCallback } from 'react';

/**
 * Vertical resizable split: renders two children stacked with a draggable divider.
 * `initialRatio` is the fraction (0–1) of space given to the top child.
 */
export default function ResizableSplit({ top, bottom, initialRatio = 0.35, minRatio = 0.1, maxRatio = 0.8, className = '' }) {
  const [ratio, setRatio] = useState(initialRatio);
  const containerRef = useRef(null);
  const dragging = useRef(false);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const onPointerMove = (ev) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      let newRatio = (ev.clientY - rect.top) / rect.height;
      newRatio = Math.max(minRatio, Math.min(maxRatio, newRatio));
      setRatio(newRatio);
    };

    const onPointerUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [minRatio, maxRatio]);

  const topPercent = `${ratio * 100}%`;
  const bottomPercent = `${(1 - ratio) * 100}%`;

  return (
    <div ref={containerRef} className={`flex flex-col ${className}`} style={{ height: '100%' }}>
      <div className="overflow-auto" style={{ height: topPercent, flexShrink: 0 }}>
        {top}
      </div>
      {/* Drag handle */}
      <div
        onPointerDown={onPointerDown}
        className="h-1.5 flex-shrink-0 cursor-row-resize group relative flex items-center justify-center hover:bg-accent/10 transition-colors"
      >
        <div className="w-8 h-0.5 rounded-full bg-border group-hover:bg-accent transition-colors" />
      </div>
      <div className="overflow-hidden" style={{ height: bottomPercent, flexShrink: 1 }}>
        {bottom}
      </div>
    </div>
  );
}
