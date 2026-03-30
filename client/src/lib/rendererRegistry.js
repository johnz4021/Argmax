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
import gsap from 'gsap';

const renderers = {};
const pendingActions = {}; // renderer name -> queued actions

let activeTimeline = null;
let timelineSpeed = 1;

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

/**
 * Apply actions with GSAP-based staggered timing.
 * Actions within a segment are sequenced instead of firing simultaneously.
 */
export function applyActionsSequenced(actions, { staggerMs = 150 } = {}) {
  // Kill any active timeline
  if (activeTimeline) activeTimeline.kill();

  activeTimeline = gsap.timeline({
    defaults: { duration: 0.3 },
    timeScale: timelineSpeed,
  });

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    activeTimeline.call(() => {
      applyAction(action);
    }, [], i * (staggerMs / 1000));
  }

  return activeTimeline;
}

export function killActiveTimeline() {
  if (activeTimeline) {
    activeTimeline.kill();
    activeTimeline = null;
  }
}

export function setTimelineSpeed(speed) {
  timelineSpeed = speed;
  if (activeTimeline) activeTimeline.timeScale(speed);
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

/**
 * Synchronously load graph data into a renderer, bypassing React's async state/effect cycle.
 * Called from the WS message handler so the graph is ready before any viz actions arrive.
 */
export function loadGraphImmediate(rendererName, graph) {
  const renderer = renderers[rendererName];
  if (renderer?.loadGraph) {
    renderer.loadGraph(graph);
  }
}
