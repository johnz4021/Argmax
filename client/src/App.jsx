import { useCallback, useEffect, useRef, useState } from 'react';
import VizLayout from './components/VizLayout';
import GraphRenderer from './components/renderers/GraphRenderer';
import Transcript from './components/Transcript';
import Controls from './components/Controls';
import LandingTabs from './components/LandingTabs';
import AuthModal from './components/AuthModal';
import ContextPanelHost from './components/context/ContextPanelHost';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useAuth } from './hooks/useAuth';
import { useTutorState, normalizeVizActions } from './hooks/useTutorState';
import { applyActions } from './lib/rendererRegistry';
import { initContextManager, destroyContextManager } from './lib/contextManager';
import { supabase } from './lib/supabase';

export default function App() {
  const { session, user, loading: authLoading, signOut } = useAuth();
  const { state, processMessage, interrupt, reset, dispatchContext } = useTutorState();
  const audioPlayer = useAudioPlayer();
  const [ttsMuted, setTtsMuted] = useState(false);
  const insertRefHolder = useRef(null);

  const contextPanelsRef = useRef(state.contextPanels);
  contextPanelsRef.current = state.contextPanels;

  useEffect(() => {
    initContextManager(dispatchContext);
    return () => destroyContextManager();
  }, [dispatchContext]);

  const onMessage = useCallback(
    (msg) => {
      console.log('[App] WS message:', msg.type, msg);
      processMessage(msg);

      // Route all viz actions through the renderer registry.
      // normalizeVizActions wraps legacy (renderer-less) actions as renderer:'graph'.
      if (msg.type === 'segment_start' && msg.viz_actions?.length > 0) {
        const normalized = normalizeVizActions(msg.viz_actions);
        console.log('[App] Routing viz_actions:', JSON.stringify(normalized).slice(0, 500));

        // Legacy compat: convert update_table to context panel update
        const tableAction = msg.viz_actions.find((a) => a.action === 'update_table');
        if (tableAction && tableAction.table) {
          // Auto-create distances panel if none exist yet (legacy graph algo path)
          if (contextPanelsRef.current.length === 0) {
            dispatchContext({
              type: 'SET_CONTEXT_PANELS',
              panels: [{ id: 'distances', type: 'key_value', title: 'Distances' }],
            });
          }
          const entries = Object.entries(tableAction.table).map(([key, value]) => ({
            key,
            value: value === Infinity || value === 'Infinity' ? '\u221e' : value,
            status: 'default',
          }));
          applyActions([{
            renderer: 'context',
            action: 'update',
            params: { panel_id: 'distances', entries },
          }]);
        }

        // Extract residual edges from show_residual_overlay actions for the toggle button
        const residualAction = msg.viz_actions.find((a) => a.action === 'show_residual_overlay');
        const residualEdges = residualAction?.params?.residual_edges || residualAction?.residual_edges;
        if (residualEdges) {
          dispatchContext({ type: 'SET_RESIDUAL_EDGES', edges: residualEdges });
        }

        applyActions(normalized);
      } else if (msg.type === 'segment_start') {
        console.log('[App] segment_start with NO viz_actions');
      }
      if (msg.type === 'interrupt_response' && msg.viz_actions?.length > 0) {
        const normalized = normalizeVizActions(msg.viz_actions);
        applyActions(normalized);
      }
      if (msg.type === 'rewind_step_narration') {
        processMessage({
          type: 'segment_start',
          segment_id: 'rewind_' + Date.now(),
          narration: msg.narration,
          phase: 'Replaying step...',
          viz_actions: [],
        });
      }
      if (msg.type === 'audio_flush') {
        audioPlayer.flush();
      }
    },
    [processMessage, dispatchContext, audioPlayer]
  );

  const onBinary = useCallback(
    (data) => {
      console.log('[Audio] Binary frame received,', data.byteLength, 'bytes');
      audioPlayer.enqueuePCM(data);
    },
    [audioPlayer]
  );

  // Only connect WebSocket when auth is ready (or if Supabase isn't configured)
  const wsEnabled = !supabase || !!user;
  const { send, connected } = useWebSocket(onMessage, onBinary, wsEnabled);

  const handleSelectAlgorithm = useCallback(
    (algorithm, data) => {
      audioPlayer.init(); // Must be from user gesture
      reset();
      if (algorithm === 'guided') {
        const msg = { type: 'start_guided', problemText: data.problemText };
        if (data.imageBase64) {
          msg.imageBase64 = data.imageBase64;
          msg.imageMimeType = data.imageMimeType;
        }
        send(msg);
      } else {
        send({ type: 'start_lesson', algorithm, source: 'A' });
      }
    },
    [send, reset, audioPlayer]
  );

  const handleGuidedResponse = useCallback(
    (response) => {
      if (state.guidedOptions?.prompt) {
        processMessage({ type: 'add_guided_question', text: state.guidedOptions.prompt });
      }
      if (typeof response === 'object' && response.optionIds) {
        // Multi-select response
        const displayText = response.labels.join(', ');
        processMessage({ type: 'add_guided_answer', text: displayText });
        send({ type: 'guided_response', optionIds: response.optionIds, labels: response.labels });
      } else {
        const displayText = response.text || response.label || String(response);
        processMessage({ type: 'add_guided_answer', text: displayText });
        if (typeof response === 'object' && response.text) {
          send({ type: 'guided_response', text: response.text });
        } else if (typeof response === 'object' && response.optionId) {
          send({ type: 'guided_response', optionId: response.optionId });
        } else {
          send({ type: 'guided_response', optionId: response });
        }
      }
      processMessage({ type: 'clear_guided_options' });
    },
    [send, processMessage, state.guidedOptions]
  );

  const handleGuidedMessage = useCallback(
    (text) => {
      processMessage({ type: 'add_student_message', text });
      send({ type: 'guided_message', text });
    },
    [send, processMessage]
  );

  const handlePause = useCallback(() => {
    send({ type: 'pause' });
    audioPlayer.flush(); // Immediately stop audio on client
  }, [send, audioPlayer]);

  const handleResume = useCallback(() => {
    send({ type: 'resume' });
    processMessage({ type: 'resumed' });
  }, [send, processMessage]);

  const handleInterrupt = useCallback(
    (question) => {
      interrupt(question);
      processMessage({ type: 'clear_guided_options' });
      send({ type: 'interrupt', question });
      send({ type: 'resume' });
    },
    [send, interrupt, processMessage]
  );

  const handleRestart = useCallback(() => {
    audioPlayer.stop();
    reset();
  }, [reset, audioPlayer]);

  const handleSpeedChange = useCallback(
    (multiplier) => {
      send({ type: 'set_speed', multiplier });
    },
    [send]
  );

  const handleTtsMuteToggle = useCallback(() => {
    setTtsMuted((prev) => {
      const next = !prev;
      send({ type: 'set_tts_muted', muted: next });
      if (next) audioPlayer.flush(); // Immediately stop any playing audio
      return next;
    });
  }, [send, audioPlayer]);

  const handleElementClick = useCallback((refText) => {
    const inputEl = insertRefHolder.current?.current;
    if (inputEl && inputEl._insertAtCursor) {
      inputEl._insertAtCursor(refText);
    }
  }, []);

  const registerInsertRef = useCallback((ref) => {
    insertRefHolder.current = ref;
  }, []);

  const handleClearHistory = useCallback(() => {
    dispatchContext({ type: 'CLEAR_LOADED_CONVERSATION' });
  }, [dispatchContext]);

  // Auth gate: if Supabase is configured, require login
  if (supabase) {
    if (authLoading) {
      return (
        <div className="h-screen flex items-center justify-center bg-gray-950">
          <div className="text-gray-400 text-sm">Loading...</div>
        </div>
      );
    }
    if (!user) {
      return <AuthModal />;
    }
  }

  const showSelector = state.status === 'idle' || state.status === 'error';
  const useVizLayout = state.vizPanels && state.vizPanels.some((p) => p.renderer !== 'graph');
  const contextOnly = !state.graph && (!state.vizPanels || state.vizPanels.length === 0) && state.contextPanels.length > 0;

  return (
    <>
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-100">Argmax</h1>
          {state.algorithm && (
            <span className="text-sm text-gray-400">
              {state.algorithm.charAt(0).toUpperCase() + state.algorithm.slice(1)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <>
              <span className="text-xs text-gray-400">{user.email}</span>
              <button
                onClick={signOut}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Sign Out
              </button>
            </>
          )}
          <div
            className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <span className="text-xs text-gray-500">
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {showSelector ? (
          <div className="flex-1">
            <LandingTabs
              onSelect={handleSelectAlgorithm}
              disabled={!connected}
              send={send}
              conversations={state.conversations}
              loadedConversation={state.loadedConversation}
              viewingHistory={state.viewingHistory}
              onClearHistory={handleClearHistory}
              processMessage={processMessage}
            />
          </div>
        ) : contextOnly ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            <ContextPanelHost panels={state.contextPanels} expanded />
            <div className="flex-1 overflow-hidden">
              <Transcript segments={state.segments} agentStatus={state.agentStatus} />
            </div>
            <Controls
              status={state.status}
              agentStatus={state.agentStatus}
              onInterrupt={handleInterrupt}
              onPause={handlePause}
              onResume={handleResume}
              onRestart={handleRestart}
              onSpeedChange={handleSpeedChange}
              onTtsMuteToggle={handleTtsMuteToggle}
              ttsMuted={ttsMuted}
              explanationMode={state.explanationMode}
              guidedOptions={state.guidedOptions}
              onGuidedResponse={handleGuidedResponse}
              mode={state.mode}
              onGuidedMessage={handleGuidedMessage}
              guidedPrompt={state.guidedPrompt}
              registerInsertRef={registerInsertRef}
            />
          </div>
        ) : (
          <>
            {/* Visualization panel - 60% */}
            <div className="w-2/3 h-full overflow-hidden border-r border-gray-800">
              {useVizLayout ? (
                <VizLayout
                  panels={state.vizPanels}
                  explanationMode={state.explanationMode}
                  segmentCount={state.segmentCount}
                  algorithm={state.algorithm}
                  residualEdges={state.latestResidualEdges}
                  onElementClick={handleElementClick}
                />
              ) : (
                <GraphRenderer
                  graph={state.graph}
                  phase={state.currentPhase}
                  explanationMode={state.explanationMode}
                  segmentCount={state.segmentCount}
                  algorithm={state.algorithm}
                  residualEdges={state.latestResidualEdges}
                  onElementClick={handleElementClick}
                />
              )}
            </div>

            {/* Transcript panel */}
            <div className="w-1/3 flex flex-col overflow-hidden">
              <ContextPanelHost panels={state.contextPanels} />
              <div className="flex-1 overflow-hidden">
                <Transcript segments={state.segments} agentStatus={state.agentStatus} />
              </div>
              <Controls
                status={state.status}
                agentStatus={state.agentStatus}
                onInterrupt={handleInterrupt}
                onPause={handlePause}
                onResume={handleResume}
                onRestart={handleRestart}
                onSpeedChange={handleSpeedChange}
              onTtsMuteToggle={handleTtsMuteToggle}
              ttsMuted={ttsMuted}
                explanationMode={state.explanationMode}
                guidedOptions={state.guidedOptions}
                onGuidedResponse={handleGuidedResponse}
                mode={state.mode}
                onGuidedMessage={handleGuidedMessage}
                guidedPrompt={state.guidedPrompt}
                registerInsertRef={registerInsertRef}
              />
            </div>
          </>
        )}
      </div>
    </div>
    <div className="h-px" />
    </>
  );
}
