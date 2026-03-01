import { useReducer, useCallback } from 'react';

const initialState = {
  status: 'idle', // idle | connecting | teaching | paused | interrupted | complete | error
  algorithm: null,
  graph: null,
  vizPanels: null, // [{ id, renderer, props }] — drives VizLayout
  segments: [],
  currentPhase: '',
  contextPanels: [],
  error: null,
  explanationMode: null, // null | { mode: 'overlay'|'rewind'|'ghost_alternative', config: {...} }
  segmentCount: 0,
  latestResidualEdges: null,
  mode: 'direct',            // 'direct' | 'guided'
  guidedPhase: null,          // 'analyzing' | 'identifying' | 'modeling' | 'executing' | 'verifying' | null
  guidedOptions: null,        // null | { prompt, options: [{ id, label }] }
  guidedPrompt: null,         // current prompt text for the input field in guided mode
};

/**
 * Normalize viz actions: wrap legacy format (no `renderer` field) for graph renderer.
 */
export function normalizeVizActions(actions) {
  if (!actions) return [];
  return actions.map((a) => {
    if (a.renderer) return a; // already new format
    // Legacy format — wrap for graph renderer
    const { action, ...rest } = a;
    return { renderer: 'graph', action, params: rest };
  });
}

function reducer(state, action) {
  switch (action.type) {
    case 'LESSON_START':
      return {
        ...initialState,
        status: 'teaching',
        algorithm: action.algorithm,
        latestResidualEdges: null,
      };

    case 'SET_RESIDUAL_EDGES':
      return { ...state, latestResidualEdges: action.edges };

    case 'CREATE_GRAPH':
      return {
        ...state,
        graph: action.graph,
        // Auto-create a graph panel when create_graph is used (backward compat)
        vizPanels: [{ id: 'graph', renderer: 'graph', props: { graph: action.graph, directed: action.graph.directed } }],
      };

    case 'SET_VIZ_PANELS':
      return { ...state, vizPanels: action.panels };

    case 'SEGMENT_START':
      return {
        ...state,
        currentPhase: action.phase || state.currentPhase,
        segments: [
          ...state.segments,
          {
            id: action.segment_id,
            narration: action.narration,
            type: 'narration',
            active: true,
          },
        ],
      };

    case 'SEGMENT_END':
      return {
        ...state,
        segmentCount: state.segmentCount + 1,
        segments: state.segments.map((s) =>
          s.id === action.segment_id ? { ...s, active: false } : s
        ),
      };

    case 'INTERRUPT_RESPONSE':
      return {
        ...state,
        status: state.previousStatus === 'complete' ? 'complete' : 'teaching',
        explanationMode:
          action.explanation_mode !== 'none'
            ? {
                mode: action.explanation_mode,
                config: action[action.explanation_mode] || {},
              }
            : null,
        segments: [
          ...state.segments,
          {
            id: 'ir_' + Date.now(),
            narration: action.answer,
            type: 'answer',
            active: false,
          },
        ],
      };

    case 'SET_EXPLANATION_MODE':
      return { ...state, explanationMode: action.explanationMode };

    case 'CLEAR_EXPLANATION_MODE':
      return { ...state, explanationMode: null };

    case 'LESSON_COMPLETE':
      return { ...state, status: 'complete' };

    case 'SET_PAUSED':
      return { ...state, status: 'paused' };

    case 'SET_RESUMED':
      return { ...state, status: 'teaching' };

    case 'SET_INTERRUPTED':
      return {
        ...state,
        status: 'interrupted',
        previousStatus: state.status,
        segments: [
          ...state.segments,
          {
            id: 'q_' + Date.now(),
            narration: action.question,
            type: 'question',
            active: false,
          },
        ],
      };

    case 'SET_CONTEXT_PANELS':
      return {
        ...state,
        contextPanels: action.panels.map((p) => ({
          id: p.id,
          type: p.type,
          title: p.title,
          data: p.initial_data || {},
        })),
      };

    case 'UPDATE_CONTEXT_PANEL':
      return {
        ...state,
        contextPanels: state.contextPanels.map((p) =>
          p.id === action.panel_id ? { ...p, data: { ...p.data, ...action.data } } : p
        ),
      };

    case 'APPEND_CONTEXT_LOG':
      return {
        ...state,
        contextPanels: state.contextPanels.map((p) => {
          if (p.id !== action.panel_id || p.type !== 'log') return p;
          const maxVisible = p.data.max_visible || 50;
          const newEntries = [...(p.data.entries || []), ...action.entries].slice(-maxVisible);
          return { ...p, data: { ...p.data, entries: newEntries } };
        }),
      };

    case 'GUIDED_START':
      return { ...initialState, status: 'teaching', mode: 'guided', guidedPhase: 'analyzing' };

    case 'GUIDED_PHASE':
      return { ...state, guidedPhase: action.phase };

    case 'GUIDED_OPTIONS':
      return { ...state, guidedOptions: { prompt: action.prompt, options: action.options, mode: action.mode || 'mc', input_placeholder: action.input_placeholder } };

    case 'CLEAR_GUIDED_OPTIONS':
      return { ...state, guidedOptions: null };

    case 'ADD_GUIDED_QUESTION':
      return { ...state, segments: [...state.segments, { id: 'gq_' + Date.now(), narration: action.text, type: 'guided_question', active: false }] };

    case 'ADD_GUIDED_ANSWER':
      return { ...state, segments: [...state.segments, { id: 'ga_' + Date.now(), narration: action.text, type: 'guided_answer', active: false }] };

    case 'GUIDED_PROMPT':
      return { ...state, guidedPrompt: action.prompt };

    case 'ADD_STUDENT_MESSAGE':
      return {
        ...state,
        segments: [
          ...state.segments,
          { id: 'sm_' + Date.now(), narration: action.text, type: 'student_message', active: false },
        ],
      };

    case 'VERIFICATION_RESULT':
      return {
        ...state,
        segments: [
          ...state.segments,
          {
            id: 'vr_' + Date.now(),
            narration: action.matches
              ? `Result matches expected output (${action.expected}).`
              : `Mismatch: expected ${action.expected}, got ${action.computed}.`,
            type: 'verification',
            matches: action.matches,
            expected: action.expected,
            computed: action.computed,
            active: false,
          },
        ],
      };

    case 'GUIDED_TRANSITION':
      return { ...state, status: 'teaching', guidedPhase: 'executing' };

    case 'ERROR':
      return { ...state, status: 'error', error: action.message };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

export function useTutorState() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const processMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'lesson_start':
        dispatch({ type: 'LESSON_START', algorithm: msg.algorithm });
        break;
      case 'create_graph':
        dispatch({ type: 'CREATE_GRAPH', graph: msg.graph });
        break;
      case 'create_visualization': {
        const panels = (msg.panels || []).map((p, i) => ({
          id: p.renderer + '_' + i,
          renderer: p.renderer,
          props: p.config || {},
        }));
        console.log('[State] SET_VIZ_PANELS:', JSON.stringify(panels));
        dispatch({ type: 'SET_VIZ_PANELS', panels });
        if (msg.context_panels) {
          dispatch({ type: 'SET_CONTEXT_PANELS', panels: msg.context_panels });
        }
        break;
      }
      case 'segment_start':
        dispatch({
          type: 'SEGMENT_START',
          segment_id: msg.segment_id,
          narration: msg.narration,
          phase: msg.phase,
        });
        break;
      case 'segment_end':
        dispatch({ type: 'SEGMENT_END', segment_id: msg.segment_id });
        break;
      case 'interrupt_response':
        dispatch({
          type: 'INTERRUPT_RESPONSE',
          answer: msg.answer,
          explanation_mode: msg.explanation_mode || 'none',
          overlay: msg.overlay,
          rewind: msg.rewind,
          ghost_alternative: msg.ghost_alternative,
        });
        break;
      case 'explanation_complete':
        dispatch({ type: 'CLEAR_EXPLANATION_MODE' });
        break;
      case 'paused':
        dispatch({ type: 'SET_PAUSED' });
        break;
      case 'resumed':
        dispatch({ type: 'SET_RESUMED' });
        break;
      case 'lesson_complete':
        dispatch({ type: 'LESSON_COMPLETE' });
        break;
      case 'guided_start':
        dispatch({ type: 'GUIDED_START' });
        break;
      case 'guided_phase':
        dispatch({ type: 'GUIDED_PHASE', phase: msg.phase });
        break;
      case 'guided_options':
        dispatch({ type: 'GUIDED_OPTIONS', prompt: msg.prompt, options: msg.options, mode: msg.mode, input_placeholder: msg.input_placeholder });
        break;
      case 'clear_guided_options':
        dispatch({ type: 'CLEAR_GUIDED_OPTIONS' });
        break;
      case 'add_guided_question':
        dispatch({ type: 'ADD_GUIDED_QUESTION', text: msg.text });
        break;
      case 'add_guided_answer':
        dispatch({ type: 'ADD_GUIDED_ANSWER', text: msg.text });
        break;
      case 'guided_prompt':
        dispatch({ type: 'GUIDED_PROMPT', prompt: msg.prompt });
        break;
      case 'add_student_message':
        dispatch({ type: 'ADD_STUDENT_MESSAGE', text: msg.text });
        break;
      case 'verification_result':
        dispatch({
          type: 'VERIFICATION_RESULT',
          matches: msg.matches,
          expected: msg.expected,
          computed: msg.computed,
        });
        break;
      case 'guided_transition':
        dispatch({ type: 'GUIDED_TRANSITION' });
        break;
      case 'error':
        dispatch({ type: 'ERROR', message: msg.message });
        break;
    }
  }, []);

  const interrupt = useCallback((question) => {
    dispatch({ type: 'SET_INTERRUPTED', question });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const dispatchContext = useCallback((action) => {
    dispatch(action);
  }, []);

  return { state, processMessage, interrupt, reset, dispatchContext };
}
