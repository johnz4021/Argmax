import { registerRenderer, unregisterRenderer } from './rendererRegistry';

let dispatchFn = null;

export function initContextManager(dispatch) {
  dispatchFn = dispatch;

  registerRenderer('context', {
    apply: (action, params) => {
      if (!dispatchFn) return;
      switch (action) {
        case 'update':
          dispatchFn({ type: 'UPDATE_CONTEXT_PANEL', panel_id: params.panel_id, data: params });
          break;
        case 'append_log':
          dispatchFn({ type: 'APPEND_CONTEXT_LOG', panel_id: params.panel_id, entries: params.entries });
          break;
        case 'clear':
          dispatchFn({ type: 'UPDATE_CONTEXT_PANEL', panel_id: params.panel_id, data: {} });
          break;
      }
    },
    takeSnapshot: () => null,
    restoreSnapshot: () => {},
    cleanup: () => {},
  });
}

export function destroyContextManager() {
  dispatchFn = null;
  unregisterRenderer('context');
}
