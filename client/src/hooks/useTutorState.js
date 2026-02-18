import { useReducer, useCallback } from 'react';

const initialState = {
  status: 'idle', // idle | connecting | teaching | paused | interrupted | complete | error
  algorithm: null,
  graph: null,
  segments: [],
  currentPhase: '',
  distanceTable: null,
  error: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'LESSON_START':
      return {
        ...initialState,
        status: 'teaching',
        algorithm: action.algorithm,
      };

    case 'CREATE_GRAPH':
      return { ...state, graph: action.graph };

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
        segments: state.segments.map((s) =>
          s.id === action.segment_id ? { ...s, active: false } : s
        ),
      };

    case 'INTERRUPT_RESPONSE':
      return {
        ...state,
        status: 'teaching',
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

    case 'UPDATE_TABLE':
      return { ...state, distanceTable: action.table };

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
      case 'segment_start':
        dispatch({
          type: 'SEGMENT_START',
          segment_id: msg.segment_id,
          narration: msg.narration,
          phase: msg.phase,
        });
        // Handle update_table viz actions
        if (msg.viz_actions) {
          const tableAction = msg.viz_actions.find((a) => a.action === 'update_table');
          if (tableAction) {
            dispatch({ type: 'UPDATE_TABLE', table: tableAction.table });
          }
        }
        break;
      case 'segment_end':
        dispatch({ type: 'SEGMENT_END', segment_id: msg.segment_id });
        break;
      case 'interrupt_response':
        dispatch({ type: 'INTERRUPT_RESPONSE', answer: msg.answer });
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

  return { state, processMessage, interrupt, reset };
}
