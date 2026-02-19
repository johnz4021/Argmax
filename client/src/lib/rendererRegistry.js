/**
 * Central routing layer. Takes a viz action with a `renderer` field
 * and dispatches it to the correct renderer's apply function.
 *
 * Each renderer registers itself with:
 *   registerRenderer('graph', { apply, takeSnapshot, restoreSnapshot, cleanup })
 *
 * If actions arrive before a renderer registers (e.g. due to lazy loading),
 * they are buffered and flushed when the renderer mounts.
 */
const renderers = {};
const pendingActions = {}; // renderer name -> queued actions

export function registerRenderer(name, handler) {
  console.log(`[Registry] Registering renderer: ${name}`);
  renderers[name] = handler;

  // Flush any buffered actions
  if (pendingActions[name]?.length > 0) {
    console.log(`[Registry] Flushing ${pendingActions[name].length} buffered actions for: ${name}`);
    for (const { action, params } of pendingActions[name]) {
      handler.apply(action, params);
    }
    delete pendingActions[name];
  }
}

export function unregisterRenderer(name) {
  delete renderers[name];
}

export function applyAction(action) {
  const renderer = renderers[action.renderer];
  if (!renderer) {
    // Buffer action for later when the renderer registers
    if (!pendingActions[action.renderer]) {
      pendingActions[action.renderer] = [];
    }
    pendingActions[action.renderer].push({
      action: action.action,
      params: action.params,
    });
    console.log(`[Registry] Buffered action for unregistered renderer '${action.renderer}': ${action.action}`, action.params);
    return;
  }
  console.log(`[Registry] Applying action to '${action.renderer}': ${action.action}`, action.params);
  renderer.apply(action.action, action.params);
}

export function applyActions(actions) {
  for (const action of actions) {
    applyAction(action);
  }
}

export function takeSnapshot(rendererName) {
  return renderers[rendererName]?.takeSnapshot?.();
}

export function restoreSnapshot(rendererName, snapshot) {
  renderers[rendererName]?.restoreSnapshot?.(snapshot);
}

export function getRenderer(name) {
  return renderers[name] || null;
}
