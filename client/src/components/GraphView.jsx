import { useEffect, useRef, useCallback } from 'react';
import cytoscape from 'cytoscape';
import { applyVizActions } from '../lib/vizActions';

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
];

export default function GraphView({ graph, vizActions, phase }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  // Initialize Cytoscape
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

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  // Load graph data
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !graph) return;

    cy.elements().remove();

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
    cy.fit(undefined, 40);
  }, [graph]);

  // Apply viz actions
  useEffect(() => {
    if (vizActions && cyRef.current) {
      applyVizActions(cyRef.current, vizActions);
    }
  }, [vizActions]);

  return (
    <div className="relative h-full">
      {phase && (
        <div className="absolute top-3 left-3 z-10 bg-gray-800/90 text-sm text-blue-300 px-3 py-1.5 rounded-lg border border-gray-700">
          {phase}
        </div>
      )}
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
