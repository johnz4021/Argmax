// Maps viz_action objects to Cytoscape API calls

export function applyVizActions(cy, actions) {
  if (!cy || !actions) return;

  for (const action of actions) {
    applyAction(cy, action);
  }
}

function applyAction(cy, action) {
  switch (action.action) {
    case 'highlight_node': {
      const node = cy.getElementById(action.node);
      node.addClass(action.className || 'highlighted');
      break;
    }

    case 'highlight_edge': {
      const edges = cy.edges().filter(
        (e) =>
          (e.data('source') === action.from && e.data('target') === action.to) ||
          (e.data('source') === action.to && e.data('target') === action.from)
      );
      edges.addClass(action.className || 'highlighted');
      break;
    }

    case 'mark_visited': {
      const node = cy.getElementById(action.node);
      node.removeClass('current');
      node.addClass('visited');
      break;
    }

    case 'mark_current': {
      // Remove current from all nodes first
      cy.nodes().removeClass('current');
      const node = cy.getElementById(action.node);
      node.addClass('current');
      break;
    }

    case 'set_label': {
      const node = cy.getElementById(action.node);
      node.data('label', action.label);
      break;
    }

    case 'reset_highlights': {
      cy.elements().removeClass('highlighted current visited path ghost examining saturated augmenting min-cut source-side sink-side');
      // Reset labels to just IDs
      cy.nodes().forEach((n) => {
        n.data('label', n.data('id'));
      });
      break;
    }

    case 'show_path': {
      if (!action.path || action.path.length < 2) break;
      for (let i = 0; i < action.path.length; i++) {
        cy.getElementById(action.path[i]).addClass('path');
        if (i < action.path.length - 1) {
          const a = action.path[i];
          const b = action.path[i + 1];
          const edges = cy.edges().filter(
            (e) =>
              (e.data('source') === a && e.data('target') === b) ||
              (e.data('source') === b && e.data('target') === a)
          );
          edges.addClass('path');
        }
      }
      break;
    }

    case 'update_edge_label': {
      const directedOnly = action.directed_only !== false;
      const edges = cy.edges().filter(
        (e) =>
          (e.data('source') === action.from && e.data('target') === action.to) ||
          (!directedOnly && e.data('source') === action.to && e.data('target') === action.from)
      );
      edges.data('weight', action.label);
      break;
    }

    case 'update_table': {
      // Table updates are handled in the state, not in Cytoscape
      // The useTutorState hook will pick up table data from segments
      break;
    }
  }
}

// === SNAPSHOT SYSTEM ===

export function takeSnapshot(cy) {
  const snapshot = {
    elements: cy.elements().map((ele) => ({
      group: ele.group(),
      id: ele.id(),
      classes: [...ele.classes()],
      data: { ...ele.data() },
      position: ele.group() === 'nodes' ? { ...ele.position() } : undefined,
    })),
  };
  return snapshot;
}

export function restoreSnapshot(cy, snapshot) {
  cy.elements('.ghost-temp').remove();
  cy.elements('.annotation-anchor').remove();

  for (const saved of snapshot.elements) {
    const ele = cy.getElementById(saved.id);
    if (!ele || ele.length === 0) continue;

    ele.removeClass('highlighted current visited path ghost examining dimmed spotlit ghost-alt saturated augmenting min-cut source-side sink-side');
    for (const cls of saved.classes) {
      ele.addClass(cls);
    }
    ele.data(saved.data);
  }
}

// === OVERLAY MODE ===

export function applyOverlay(cy, overlay) {
  if (!overlay) return;

  const spotlitNodeIds = new Set(overlay.spotlight_nodes || []);
  const spotlitEdgeKeys = new Set(
    (overlay.spotlight_edges || []).map((e) => `${e.from}-${e.to}`)
  );

  cy.elements().addClass('dimmed');

  cy.nodes().forEach((n) => {
    if (spotlitNodeIds.has(n.id())) {
      n.removeClass('dimmed');
      n.addClass('spotlit');
    }
  });

  cy.edges().forEach((e) => {
    const key = `${e.data('source')}-${e.data('target')}`;
    if (spotlitEdgeKeys.has(key)) {
      e.removeClass('dimmed');
      e.addClass('spotlit');
    }
  });
}

export function removeOverlay(cy) {
  cy.elements().removeClass('dimmed spotlit');
}

// === GHOST ALTERNATIVE MODE ===

export function applyGhostAlternative(cy, ghostConfig) {
  if (!ghostConfig) return;

  const { ghost_path, ghost_label, actual_path, actual_label } = ghostConfig;

  if (actual_path && actual_path.length >= 2) {
    for (let i = 0; i < actual_path.length; i++) {
      const node = cy.getElementById(actual_path[i]);
      node.addClass('spotlit');
      if (i < actual_path.length - 1) {
        const edge = cy.edges().filter(
          (e) => e.data('source') === actual_path[i] && e.data('target') === actual_path[i + 1]
        );
        edge.addClass('spotlit');
      }
    }
    if (actual_label) {
      const lastNode = cy.getElementById(actual_path[actual_path.length - 1]);
      const currentLabel = lastNode.data('label') || lastNode.id();
      lastNode.data('label', `${currentLabel}\n✓ ${actual_label}`);
    }
  }

  if (ghost_path && ghost_path.length >= 2) {
    for (let i = 0; i < ghost_path.length - 1; i++) {
      const existingEdge = cy.edges().filter(
        (e) => e.data('source') === ghost_path[i] && e.data('target') === ghost_path[i + 1]
      );
      if (existingEdge.length > 0) {
        existingEdge.addClass('ghost-alt');
      } else {
        cy.add({
          group: 'edges',
          data: {
            id: `ghost-${ghost_path[i]}-${ghost_path[i + 1]}`,
            source: ghost_path[i],
            target: ghost_path[i + 1],
            weight: '',
          },
          classes: 'ghost-alt ghost-temp',
        });
      }
    }
    if (ghost_label) {
      const lastGhostNode = cy.getElementById(ghost_path[ghost_path.length - 1]);
      const currentLabel = lastGhostNode.data('label') || lastGhostNode.id();
      lastGhostNode.data('label', `${currentLabel}\n✗ ${ghost_label}`);
    }
  }

  const allRelevantIds = new Set([...(ghost_path || []), ...(actual_path || [])]);
  cy.nodes().forEach((n) => {
    if (!allRelevantIds.has(n.id())) {
      n.addClass('dimmed');
    }
  });
}

export function removeGhostAlternative(cy) {
  cy.elements('.ghost-temp').remove();
  cy.elements().removeClass('ghost-alt dimmed spotlit');
}
