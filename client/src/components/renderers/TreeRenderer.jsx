import { useEffect, useRef, useState, useCallback } from 'react';
import { registerRenderer, unregisterRenderer } from '../../lib/rendererRegistry';
import * as d3 from 'd3';

const NODE_RADIUS = 22;
const LEVEL_HEIGHT = 70;
const NODE_COLORS = {
  default: { fill: '#374151', stroke: '#6B7280' },        // gray-700/500
  current: { fill: '#3B82F6', stroke: '#60A5FA' },        // blue-500/400
  comparing: { fill: '#EAB308', stroke: '#FACC15' },      // yellow-500/400
  inserted: { fill: '#22C55E', stroke: '#4ADE80' },       // green-500/400
  deleted: { fill: '#EF4444', stroke: '#F87171' },        // red-500/400
  rotated: { fill: '#A855F7', stroke: '#C084FC' },        // purple-500/400
  highlighted: { fill: '#F59E0B', stroke: '#FBBF24' },    // amber-500/400
  sifting: { fill: '#06B6D4', stroke: '#22D3EE' },        // cyan-500/400
};

const EDGE_COLORS = {
  default: '#6B7280',
  highlighted: '#FACC15',
  sifting: '#22D3EE',
};

/**
 * Builds a D3 hierarchy from a flat node/edge list.
 * Returns { hierarchy, nodeMap } where nodeMap maps id -> node data.
 */
function buildHierarchy(nodes, edges, rootId) {
  if (!nodes || nodes.length === 0) return null;

  const nodeMap = {};
  for (const n of nodes) {
    nodeMap[n.id] = { ...n, children: [] };
  }

  for (const e of edges) {
    const parent = nodeMap[e.from];
    const child = nodeMap[e.to];
    if (parent && child) {
      // Maintain left/right ordering: left child first
      if (e.side === 'right') {
        parent.children.push(child);
      } else {
        parent.children.unshift(child);
      }
    }
  }

  const root = nodeMap[rootId];
  if (!root) return null;

  // For binary trees, ensure placeholder nulls for missing children
  // so the layout positions left vs right correctly
  function ensureBinarySlots(node) {
    if (!node) return node;
    // Check if this node should have children based on edges
    const hasLeft = edges.some(e => e.from === node.id && e.side === 'left');
    const hasRight = edges.some(e => e.from === node.id && e.side === 'right');

    if (hasLeft || hasRight) {
      // Rebuild children array with proper ordering
      const leftChild = node.children.find(c =>
        edges.some(e => e.from === node.id && e.to === c.id && e.side === 'left')
      );
      const rightChild = node.children.find(c =>
        edges.some(e => e.from === node.id && e.to === c.id && e.side === 'right')
      );
      node.children = [];
      if (leftChild) {
        ensureBinarySlots(leftChild);
        node.children.push(leftChild);
      }
      if (rightChild) {
        ensureBinarySlots(rightChild);
        node.children.push(rightChild);
      }
    } else {
      for (const child of node.children) {
        ensureBinarySlots(child);
      }
    }
    return node;
  }

  ensureBinarySlots(root);
  return root;
}

/** Build edge keys from a path array, e.g. ['A','B','C'] -> ['A-B','B-C'] */
function buildEdgeKeys(path) {
  const keys = [];
  for (let i = 0; i < path.length - 1; i++) {
    keys.push(`${path[i]}-${path[i + 1]}`);
  }
  return keys;
}

export default function TreeRenderer({
  rendererId = 'tree',
  phase,
  explanationMode,
  segmentCount,
}) {
  const svgRef = useRef(null);
  const [treeData, setTreeData] = useState(null); // { nodes, edges, root }
  const [nodeClasses, setNodeClasses] = useState({}); // id -> className
  const [edgeClasses, setEdgeClasses] = useState({}); // 'from-to' -> className
  const [nodeColors, setNodeColors] = useState({}); // id -> 'red'|'black' for RB trees
  const [heapArray, setHeapArray] = useState(null); // array representation for heaps
  const [levelHighlight, setLevelHighlight] = useState(null);
  const [overlayState, setOverlayState] = useState(null);
  const [ghostState, setGhostState] = useState(null);
  const snapshotsRef = useRef([]);
  const preExplanationRef = useRef(null);

  const takeTreeSnapshot = useCallback(() => {
    return {
      treeData: treeData ? JSON.parse(JSON.stringify(treeData)) : null,
      nodeClasses: { ...nodeClasses },
      edgeClasses: { ...edgeClasses },
      nodeColors: { ...nodeColors },
      heapArray: heapArray ? [...heapArray] : null,
      levelHighlight,
    };
  }, [treeData, nodeClasses, edgeClasses, nodeColors, heapArray, levelHighlight]);

  const restoreTreeSnapshot = useCallback((snap) => {
    if (!snap) return;
    setTreeData(snap.treeData);
    setNodeClasses(snap.nodeClasses);
    setEdgeClasses(snap.edgeClasses);
    setNodeColors(snap.nodeColors);
    setHeapArray(snap.heapArray);
    setLevelHighlight(snap.levelHighlight);
  }, []);

  const applyTreeAction = useCallback((action, params) => {
    switch (action) {
      case 'set_tree': {
        setTreeData({
          nodes: params.nodes || [],
          edges: params.edges || [],
          root: params.root,
        });
        setNodeClasses({});
        setEdgeClasses({});
        setNodeColors({});
        setHeapArray(params.heap_array || null);
        setLevelHighlight(null);
        break;
      }
      case 'highlight_node': {
        setNodeClasses(prev => ({
          ...prev,
          [params.id]: params.className || 'highlighted',
        }));
        break;
      }
      case 'highlight_edge': {
        const key = `${params.from}-${params.to}`;
        setEdgeClasses(prev => ({
          ...prev,
          [key]: params.className || 'highlighted',
        }));
        break;
      }
      case 'insert_node': {
        setTreeData(prev => {
          if (!prev) {
            // First node becomes root
            return {
              nodes: [{ id: params.id, value: params.value }],
              edges: [],
              root: params.id,
            };
          }
          const newNodes = [...prev.nodes, { id: params.id, value: params.value }];
          const newEdges = params.parent
            ? [...prev.edges, { from: params.parent, to: params.id, side: params.side || 'left' }]
            : prev.edges;
          return { nodes: newNodes, edges: newEdges, root: prev.root };
        });
        setNodeClasses(prev => ({ ...prev, [params.id]: 'inserted' }));
        break;
      }
      case 'delete_node': {
        setNodeClasses(prev => ({ ...prev, [params.id]: 'deleted' }));
        setTimeout(() => {
          setTreeData(prev => {
            if (!prev) return prev;
            return {
              nodes: prev.nodes.filter(n => n.id !== params.id),
              edges: prev.edges.filter(e => e.from !== params.id && e.to !== params.id),
              root: prev.root === params.id ? null : prev.root,
            };
          });
          setNodeClasses(prev => {
            const next = { ...prev };
            delete next[params.id];
            return next;
          });
        }, 400);
        break;
      }
      case 'rotate_left':
      case 'rotate_right': {
        // Rotation: restructure edges
        // For rotate_left on pivot P: P's right child R becomes parent, P becomes R's left child
        // For rotate_right on pivot P: P's left child L becomes parent, P becomes L's right child
        const pivotId = params.pivot;
        setNodeClasses(prev => ({ ...prev, [pivotId]: 'rotated' }));
        setTreeData(prev => {
          if (!prev) return prev;
          const edges = [...prev.edges];
          const isLeft = action === 'rotate_left';

          // Find the child that will become the new parent
          const childEdge = edges.find(e =>
            e.from === pivotId && e.side === (isLeft ? 'right' : 'left')
          );
          if (!childEdge) return prev;
          const childId = childEdge.to;

          // Find pivot's parent edge
          const parentEdge = edges.find(e => e.to === pivotId);

          // Find child's inner subtree (left for rotate_left, right for rotate_right)
          const innerSide = isLeft ? 'left' : 'right';
          const innerEdgeIdx = edges.findIndex(e => e.from === childId && e.side === innerSide);

          // Remove the edge from pivot to child
          const pivotChildIdx = edges.findIndex(e => e.from === pivotId && e.to === childId);
          if (pivotChildIdx >= 0) edges.splice(pivotChildIdx, 1);

          // Move child's inner subtree to pivot
          if (innerEdgeIdx >= 0) {
            const innerEdge = edges[innerEdgeIdx > pivotChildIdx ? innerEdgeIdx - 1 : innerEdgeIdx];
            innerEdge.from = pivotId;
            innerEdge.side = isLeft ? 'right' : 'left';
          }

          // Make pivot a child of the child node
          edges.push({ from: childId, to: pivotId, side: innerSide });

          // Update parent to point to child instead of pivot
          if (parentEdge) {
            parentEdge.to = childId;
          }

          const newRoot = prev.root === pivotId ? childId : prev.root;
          return { nodes: prev.nodes, edges, root: newRoot };
        });
        break;
      }
      case 'recolor_node': {
        setNodeColors(prev => ({
          ...prev,
          [params.id]: params.color,
        }));
        break;
      }
      case 'sift_up':
      case 'sift_down': {
        setNodeClasses(prev => ({ ...prev, [params.id]: 'sifting' }));
        break;
      }
      case 'mark_level': {
        setLevelHighlight(params.level);
        break;
      }
      case 'update_heap_array': {
        setHeapArray(params.array ? [...params.array] : null);
        break;
      }
      case 'reset': {
        setNodeClasses({});
        setEdgeClasses({});
        setNodeColors({});
        setLevelHighlight(null);
        break;
      }
    }
  }, []);

  // Register with renderer registry
  useEffect(() => {
    registerRenderer(rendererId, {
      apply: applyTreeAction,
      takeSnapshot: takeTreeSnapshot,
      restoreSnapshot: restoreTreeSnapshot,
      cleanup: () => {
        setNodeClasses({});
        setEdgeClasses({});
        setNodeColors({});
        setLevelHighlight(null);
      },
    });
    return () => unregisterRenderer(rendererId);
  }, [rendererId, applyTreeAction, takeTreeSnapshot, restoreTreeSnapshot]);

  // Take snapshot after each segment
  useEffect(() => {
    if (segmentCount === undefined || segmentCount === 0 || !treeData) return;
    if (explanationMode?.mode === 'rewind') return;
    snapshotsRef.current.push(takeTreeSnapshot());
  }, [segmentCount, takeTreeSnapshot, explanationMode]);

  // Handle explanation mode
  useEffect(() => {
    if (explanationMode?.mode === 'rewind') {
      preExplanationRef.current = takeTreeSnapshot();
      const stepsBack = explanationMode.config?.steps_back || 2;
      const idx = Math.max(0, snapshotsRef.current.length - stepsBack);
      if (snapshotsRef.current[idx]) {
        restoreTreeSnapshot(snapshotsRef.current[idx]);
      }
    } else if (explanationMode?.mode === 'overlay') {
      preExplanationRef.current = takeTreeSnapshot();
      const config = explanationMode.config;
      setOverlayState({
        spotlitNodes: new Set(config.spotlight_nodes || []),
        spotlitEdges: new Set((config.spotlight_edges || []).map(e => `${e.from}-${e.to}`)),
        annotations: config.annotations || [],
      });
    } else if (explanationMode?.mode === 'ghost_alternative') {
      preExplanationRef.current = takeTreeSnapshot();
      const config = explanationMode.config;
      setGhostState({
        ghostPath: new Set(config.ghost_path || []),
        actualPath: new Set(config.actual_path || []),
        ghostEdges: new Set(buildEdgeKeys(config.ghost_path || [])),
        actualEdges: new Set(buildEdgeKeys(config.actual_path || [])),
        ghostLabel: config.ghost_label,
        actualLabel: config.actual_label,
      });
    } else if (explanationMode === null && preExplanationRef.current) {
      setOverlayState(null);
      setGhostState(null);
      restoreTreeSnapshot(preExplanationRef.current);
      preExplanationRef.current = null;
    }
  }, [explanationMode, takeTreeSnapshot, restoreTreeSnapshot]);

  // D3 tree layout rendering
  useEffect(() => {
    if (!svgRef.current || !treeData || !treeData.nodes.length) return;

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth || 600;
    const height = svgRef.current.clientHeight || 400;
    const margin = { top: 40, right: 40, bottom: 60, left: 40 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Build hierarchy
    const rootData = buildHierarchy(treeData.nodes, treeData.edges, treeData.root);
    if (!rootData) {
      svg.selectAll('*').remove();
      return;
    }

    const hierarchy = d3.hierarchy(rootData, d => d.children.length > 0 ? d.children : null);
    const treeLayout = d3.tree().size([innerWidth, Math.min(innerHeight, hierarchy.height * LEVEL_HEIGHT + 60)]);
    treeLayout(hierarchy);

    // Clear and set up
    svg.selectAll('*').remove();
    const g = svg.append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);

    // Draw edges
    const links = hierarchy.links();
    g.selectAll('.tree-link')
      .data(links)
      .join('line')
      .attr('class', 'tree-link')
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y)
      .attr('stroke', d => {
        const key = `${d.source.data.id}-${d.target.data.id}`;
        if (ghostState?.actualEdges.has(key)) return '#60a5fa';
        if (ghostState?.ghostEdges.has(key)) return '#ef4444';
        if (overlayState?.spotlitEdges.has(key)) return '#60a5fa';
        const cls = edgeClasses[key] || 'default';
        return EDGE_COLORS[cls] || EDGE_COLORS.default;
      })
      .attr('stroke-width', d => {
        const key = `${d.source.data.id}-${d.target.data.id}`;
        if (ghostState?.actualEdges.has(key) || ghostState?.ghostEdges.has(key)) return 3;
        if (overlayState?.spotlitEdges.has(key)) return 3;
        return edgeClasses[key] ? 3 : 2;
      })
      .attr('stroke-dasharray', d => {
        const key = `${d.source.data.id}-${d.target.data.id}`;
        if (ghostState?.ghostEdges.has(key)) return '6,3';
        return null;
      })
      .attr('opacity', d => {
        const key = `${d.source.data.id}-${d.target.data.id}`;
        const nodeId = d.target.data.id;
        if (ghostState) {
          if (ghostState.ghostEdges.has(key)) return 0.4;
          if (ghostState.actualEdges.has(key)) return 1;
          return 0.15;
        }
        if (overlayState) {
          if (overlayState.spotlitEdges.has(key)) return 1;
          return 0.15;
        }
        return 0.8;
      });

    // Draw nodes
    const nodeGroups = g.selectAll('.tree-node')
      .data(hierarchy.descendants())
      .join('g')
      .attr('class', 'tree-node')
      .attr('transform', d => `translate(${d.x}, ${d.y})`);

    // Node circles
    nodeGroups.append('circle')
      .attr('r', NODE_RADIUS)
      .attr('fill', d => {
        const cls = nodeClasses[d.data.id] || 'default';
        return (NODE_COLORS[cls] || NODE_COLORS.default).fill;
      })
      .attr('stroke', d => {
        const id = d.data.id;
        if (ghostState?.actualPath.has(id)) return '#60a5fa';
        if (ghostState?.ghostPath.has(id)) return '#ef4444';
        if (overlayState?.spotlitNodes.has(id)) return '#60a5fa';
        const cls = nodeClasses[id] || 'default';
        return (NODE_COLORS[cls] || NODE_COLORS.default).stroke;
      })
      .attr('stroke-width', d => {
        const id = d.data.id;
        if (overlayState?.spotlitNodes.has(id) || ghostState?.actualPath.has(id) || ghostState?.ghostPath.has(id)) return 4;
        return 2.5;
      })
      .attr('stroke-dasharray', d => {
        if (ghostState?.ghostPath.has(d.data.id)) return '6,3';
        return null;
      })
      .attr('opacity', d => {
        const id = d.data.id;
        if (ghostState) {
          if (ghostState.ghostPath.has(id)) return 0.4;
          if (ghostState.actualPath.has(id)) return 1;
          return 0.15;
        }
        if (overlayState) {
          return overlayState.spotlitNodes.has(id) ? 1 : 0.15;
        }
        return 1;
      })
      .style('transition', 'fill 0.3s, stroke 0.3s');

    // Red-black tree color indicators
    nodeGroups.each(function(d) {
      const rbColor = nodeColors[d.data.id];
      if (rbColor) {
        d3.select(this).append('circle')
          .attr('r', 6)
          .attr('cx', NODE_RADIUS - 4)
          .attr('cy', -(NODE_RADIUS - 4))
          .attr('fill', rbColor === 'red' ? '#EF4444' : '#1F2937')
          .attr('stroke', rbColor === 'red' ? '#FCA5A5' : '#6B7280')
          .attr('stroke-width', 1.5);
      }
    });

    // Node value text
    nodeGroups.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('fill', 'white')
      .attr('font-size', '14px')
      .attr('font-weight', 'bold')
      .attr('font-family', 'monospace')
      .attr('opacity', d => {
        const id = d.data.id;
        if (ghostState) {
          if (ghostState.ghostPath.has(id)) return 0.4;
          if (ghostState.actualPath.has(id)) return 1;
          return 0.15;
        }
        if (overlayState) {
          return overlayState.spotlitNodes.has(id) ? 1 : 0.15;
        }
        return 1;
      })
      .text(d => d.data.value);

    // Overlay annotations
    if (overlayState?.annotations?.length) {
      const nodePositions = {};
      hierarchy.descendants().forEach(d => { nodePositions[d.data.id] = { x: d.x, y: d.y }; });
      for (const ann of overlayState.annotations) {
        const pos = nodePositions[ann.target];
        if (!pos) continue;
        const offsetX = ann.position === 'left' ? -80 : ann.position === 'right' ? 40 : 0;
        const offsetY = ann.position === 'top' ? -(NODE_RADIUS + 30) : ann.position === 'bottom' ? (NODE_RADIUS + 10) : -(NODE_RADIUS + 30);
        g.append('foreignObject')
          .attr('x', pos.x + offsetX - 60)
          .attr('y', pos.y + offsetY)
          .attr('width', 140)
          .attr('height', 40)
          .append('xhtml:div')
          .style('background', 'rgba(17,24,39,0.95)')
          .style('border', '1px solid #3b82f6')
          .style('color', '#93c5fd')
          .style('font-size', '11px')
          .style('padding', '2px 6px')
          .style('border-radius', '4px')
          .style('text-align', 'center')
          .style('pointer-events', 'none')
          .style('white-space', 'nowrap')
          .text(ann.text);
      }
    }

    // Level highlight
    if (levelHighlight !== null) {
      const levelNodes = hierarchy.descendants().filter(d => d.depth === levelHighlight);
      if (levelNodes.length > 0) {
        const minX = Math.min(...levelNodes.map(d => d.x)) - NODE_RADIUS - 10;
        const maxX = Math.max(...levelNodes.map(d => d.x)) + NODE_RADIUS + 10;
        const y = levelNodes[0].y;
        g.insert('rect', '.tree-node')
          .attr('x', minX)
          .attr('y', y - NODE_RADIUS - 8)
          .attr('width', maxX - minX)
          .attr('height', NODE_RADIUS * 2 + 16)
          .attr('rx', 8)
          .attr('fill', 'rgba(59, 130, 246, 0.15)')
          .attr('stroke', 'rgba(59, 130, 246, 0.3)')
          .attr('stroke-width', 1);
      }
    }

  }, [treeData, nodeClasses, edgeClasses, nodeColors, levelHighlight, overlayState, ghostState]);

  return (
    <div className="relative h-full flex flex-col">
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

      {!treeData || treeData.nodes.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-500">Waiting for tree data...</p>
        </div>
      ) : (
        <>
          <svg
            ref={svgRef}
            className="flex-1 w-full"
            style={{ minHeight: '300px' }}
          />
          {/* Heap array representation */}
          {heapArray && (
            <div className="px-4 pb-3">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1 text-center">
                Heap Array
              </div>
              <div className="flex items-center justify-center gap-1">
                {heapArray.map((val, idx) => {
                  const nodeId = treeData.nodes[idx]?.id;
                  const cls = nodeId ? (nodeClasses[nodeId] || 'default') : 'default';
                  const colors = NODE_COLORS[cls] || NODE_COLORS.default;
                  return (
                    <div
                      key={idx}
                      className="flex flex-col items-center"
                    >
                      <div
                        className="flex items-center justify-center rounded border-2 px-2 py-1 min-w-[32px] transition-all duration-300"
                        style={{ backgroundColor: colors.fill, borderColor: colors.stroke }}
                      >
                        <span className="text-xs font-mono text-white font-bold">{val}</span>
                      </div>
                      <span className="text-[9px] text-gray-500 font-mono">{idx}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
