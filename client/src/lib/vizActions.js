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
        (e) => e.data('source') === action.from && e.data('target') === action.to
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
      const currentLabel = node.data('id');
      const dist = action.label;
      node.data('label', `${currentLabel}\n${dist}`);
      break;
    }

    case 'reset_highlights': {
      cy.elements().removeClass('highlighted current visited path ghost examining');
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
          const edges = cy.edges().filter(
            (e) =>
              e.data('source') === action.path[i] &&
              e.data('target') === action.path[i + 1]
          );
          edges.addClass('path');
        }
      }
      break;
    }

    case 'update_table': {
      // Table updates are handled in the state, not in Cytoscape
      // The useTutorState hook will pick up table data from segments
      break;
    }
  }
}
