import { useEffect, useRef, useState, useCallback } from 'react';
import cytoscape from 'cytoscape';
import {
  applyVizActions,
  takeSnapshot,
  restoreSnapshot,
  applyOverlay,
  removeOverlay,
  applyGhostAlternative,
  removeGhostAlternative,
} from '../../lib/vizActions';
import { registerRenderer, unregisterRenderer } from '../../lib/rendererRegistry';

const CYTOSCAPE_STYLE = [
  {
    selector: 'node',
    style: {
      label: 'data(label)',
      'text-valign': 'center',
      'text-halign': 'center',
      'background-color': '#374151',
      color: '#f3f4f6',
      'border-width': 2,
      'border-color': '#6b7280',
      width: 50,
      height: 50,
      'font-size': '14px',
      'text-wrap': 'wrap',
      'text-max-width': '60px',
      'transition-property': 'background-color, border-color, border-width',
      'transition-duration': '0.3s',
    },
  },
  {
    selector: 'edge',
    style: {
      label: 'data(weight)',
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 1.2,
      'line-color': '#4b5563',
      'target-arrow-color': '#4b5563',
      width: 2,
      'font-size': '12px',
      color: '#9ca3af',
      'text-background-color': '#111827',
      'text-background-opacity': 0.8,
      'text-background-padding': '3px',
      'transition-property': 'line-color, target-arrow-color, width',
      'transition-duration': '0.3s',
    },
  },
  {
    selector: '.highlighted',
    style: {
      'background-color': '#fbbf24',
      'border-color': '#f59e0b',
      'line-color': '#fbbf24',
      'target-arrow-color': '#fbbf24',
      width: 3,
    },
  },
  {
    selector: '.current',
    style: {
      'background-color': '#3b82f6',
      'border-color': '#2563eb',
      'border-width': 4,
    },
  },
  {
    selector: '.visited',
    style: {
      'background-color': '#10b981',
      'border-color': '#059669',
    },
  },
  {
    selector: '.path',
    style: {
      'background-color': '#8b5cf6',
      'border-color': '#7c3aed',
      'border-width': 4,
      'line-color': '#8b5cf6',
      'target-arrow-color': '#8b5cf6',
      width: 4,
    },
  },
  {
    selector: '.examining',
    style: {
      'line-color': '#f59e0b',
      'target-arrow-color': '#f59e0b',
      width: 3,
    },
  },
  {
    selector: '.ghost',
    style: {
      opacity: 0.3,
    },
  },
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
  {
    selector: '.mst-edge',
    style: {
      'line-color': '#10b981',
      'target-arrow-color': '#10b981',
      width: 4,
    },
  },
  {
    selector: '.strikethrough',
    style: {
      'line-color': '#ef4444',
      'target-arrow-color': '#ef4444',
      'line-style': 'dashed',
      opacity: 0.4,
      width: 2,
    },
  },
];

/**
 * Apply a single graph viz action to the Cytoscape instance.
 * This bridges the new unified protocol (action + params) to the existing
 * applyVizActions format.
 */
function applyGraphAction(cy, action, params) {
  if (!cy) return;
  // Convert the unified format to the legacy format that applyVizActions expects
  const legacyAction = { action, ...params };
  applyVizActions(cy, [legacyAction]);
}

export default function GraphRenderer({
  graph,
  vizActions,
  phase,
  explanationMode,
  segmentCount,
  rendererId = 'graph',
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const snapshotsRef = useRef([]);
  const preExplanationSnapshotRef = useRef(null);
  const [annotations, setAnnotations] = useState([]);

  // Initialize Cytoscape and register with renderer registry
  useEffect(() => {
    if (!containerRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      style: CYTOSCAPE_STYLE,
      layout: { name: 'preset' },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: false,
    });

    cyRef.current = cy;

    registerRenderer(rendererId, {
      apply: (action, params) => applyGraphAction(cy, action, params),
      takeSnapshot: () => takeSnapshot(cy),
      restoreSnapshot: (snap) => restoreSnapshot(cy, snap),
      cleanup: () => {
        removeOverlay(cy);
        removeGhostAlternative(cy);
      },
    });

    return () => {
      unregisterRenderer(rendererId);
      cy.destroy();
      cyRef.current = null;
    };
  }, [rendererId]);

  // Load graph data
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !graph) return;

    cy.elements().remove();
    snapshotsRef.current = [];

    const elements = [];
    for (const node of graph.nodes) {
      elements.push({
        group: 'nodes',
        data: { id: node.id, label: node.label || node.id },
        position: graph.positions?.[node.id] || { x: 0, y: 0 },
      });
    }
    for (const edge of graph.edges) {
      elements.push({
        group: 'edges',
        data: {
          id: `${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
          weight: edge.weight ?? '',
        },
      });
    }

    cy.add(elements);

    if (graph.directed === false) {
      cy.edges().style('target-arrow-shape', 'none');
    }

    cy.fit(undefined, 40);
  }, [graph]);

  // Apply viz actions (supports both legacy array and new registry format)
  useEffect(() => {
    if (vizActions && cyRef.current) {
      applyVizActions(cyRef.current, vizActions);
    }
  }, [vizActions]);

  // Take snapshot after each segment completes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || segmentCount === undefined || segmentCount === 0) return;
    snapshotsRef.current.push(takeSnapshot(cy));
  }, [segmentCount]);

  // Recompute annotation positions on viewport changes
  const updateAnnotationPositions = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || annotations.length === 0) return;

    setAnnotations((prev) =>
      prev.map((ann) => {
        const ele = cy.getElementById(ann.target);
        if (!ele || ele.length === 0) return ann;
        const pos = ele.renderedPosition();
        return { ...ann, x: pos.x, y: pos.y };
      })
    );
  }, [annotations.length]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.on('viewport', updateAnnotationPositions);
    return () => cy.off('viewport', updateAnnotationPositions);
  }, [updateAnnotationPositions]);

  // Handle explanation mode changes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (explanationMode?.mode === 'overlay') {
      preExplanationSnapshotRef.current = takeSnapshot(cy);
      applyOverlay(cy, explanationMode.config);
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
      const idx = Math.max(
        0,
        snapshotsRef.current.length - (explanationMode.config?.steps_back || 2)
      );
      if (snapshotsRef.current[idx]) {
        restoreSnapshot(cy, snapshotsRef.current[idx]);
      }
    } else if (explanationMode === null && preExplanationSnapshotRef.current) {
      removeOverlay(cy);
      removeGhostAlternative(cy);
      restoreSnapshot(cy, preExplanationSnapshotRef.current);
      preExplanationSnapshotRef.current = null;
      setAnnotations([]);
    }
  }, [explanationMode]);

  return (
    <div className="relative h-full">
      {phase && (
        <div className="absolute top-3 left-3 z-10 bg-gray-800/90 text-sm text-blue-300 px-3 py-1.5 rounded-lg border border-gray-700">
          {phase}
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />

      {explanationMode && (
        <div className="absolute top-3 right-3 z-10 bg-purple-900/90 text-sm text-purple-200 px-3 py-1.5 rounded-lg border border-purple-700 flex items-center gap-2">
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
          Explaining...
        </div>
      )}

      {annotations.map((ann, i) => (
        <div
          key={i}
          className="absolute z-20 bg-gray-900/95 border border-blue-500 text-blue-200 text-sm px-3 py-2 rounded-md shadow-lg pointer-events-none max-w-[240px]"
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
}
