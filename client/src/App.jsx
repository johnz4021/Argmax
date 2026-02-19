import { useCallback } from 'react';
import VizLayout from './components/VizLayout';
import GraphRenderer from './components/renderers/GraphRenderer';
import Transcript from './components/Transcript';
import Controls from './components/Controls';
import AlgoSelector from './components/AlgoSelector';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useTutorState, normalizeVizActions } from './hooks/useTutorState';
import { applyActions } from './lib/rendererRegistry';

export default function App() {
  const { state, processMessage, interrupt, reset } = useTutorState();
  const audioPlayer = useAudioPlayer();

  const onMessage = useCallback(
    (msg) => {
      console.log('[App] WS message:', msg.type, msg);
      processMessage(msg);

      // Route all viz actions through the renderer registry.
      // normalizeVizActions wraps legacy (renderer-less) actions as renderer:'graph'.
      if (msg.type === 'segment_start' && msg.viz_actions?.length > 0) {
        const normalized = normalizeVizActions(msg.viz_actions);
        console.log('[App] Routing viz_actions:', JSON.stringify(normalized).slice(0, 500));
        applyActions(normalized);
      } else if (msg.type === 'segment_start') {
        console.log('[App] segment_start with NO viz_actions');
      }
      if (msg.type === 'interrupt_response' && msg.viz_actions?.length > 0) {
        const normalized = normalizeVizActions(msg.viz_actions);
        applyActions(normalized);
      }
      // create_visualization and explanation_complete are handled by processMessage above
      if (msg.type === 'rewind_step_narration') {
        processMessage({
          type: 'segment_start',
          segment_id: 'rewind_' + Date.now(),
          narration: msg.narration,
          phase: 'Replaying step...',
          viz_actions: [],
        });
      }
    },
    [processMessage]
  );

  const onBinary = useCallback(
    (data) => {
      console.log('[Audio] Binary frame received,', data.byteLength, 'bytes');
      audioPlayer.enqueuePCM(data);
    },
    [audioPlayer]
  );

  const { send, connected } = useWebSocket(onMessage, onBinary);

  const handleSelectAlgorithm = useCallback(
    (algorithm) => {
      audioPlayer.init(); // Must be from user gesture
      reset();
      send({ type: 'start_lesson', algorithm, source: 'A' });
    },
    [send, reset, audioPlayer]
  );

  const handlePause = useCallback(() => {
    send({ type: 'pause' });
  }, [send]);

  const handleResume = useCallback(() => {
    send({ type: 'resume' });
    processMessage({ type: 'resumed' });
  }, [send, processMessage]);

  const handleInterrupt = useCallback(
    (question) => {
      interrupt(question);
      send({ type: 'interrupt', question });
      send({ type: 'resume' });
    },
    [send, interrupt]
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

  const showSelector = state.status === 'idle' || state.status === 'error';

  // Determine if we should use the new VizLayout or legacy GraphRenderer
  const useVizLayout = state.vizPanels && state.vizPanels.some((p) => p.renderer !== 'graph');

  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-gray-100">AlgoTutor</h1>
          {state.algorithm && (
            <span className="text-sm text-gray-400">
              {state.algorithm.charAt(0).toUpperCase() + state.algorithm.slice(1)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
            <AlgoSelector onSelect={handleSelectAlgorithm} disabled={!connected} />
          </div>
        ) : (
          <>
            {/* Visualization panel - 60% */}
            <div className="w-2/3 border-r border-gray-800">
              {useVizLayout ? (
                <VizLayout
                  panels={state.vizPanels}
                  explanationMode={state.explanationMode}
                  segmentCount={state.segmentCount}
                />
              ) : (
                <GraphRenderer
                  graph={state.graph}
                  phase={state.currentPhase}
                  explanationMode={state.explanationMode}
                  segmentCount={state.segmentCount}
                />
              )}
            </div>

            {/* Transcript panel - 40% */}
            <div className="w-1/3 flex flex-col">
              <div className="flex-1 overflow-hidden">
                <Transcript
                  segments={state.segments}
                  distanceTable={state.distanceTable}
                />
              </div>
              <Controls
                status={state.status}
                onInterrupt={handleInterrupt}
                onPause={handlePause}
                onResume={handleResume}
                onRestart={handleRestart}
                onSpeedChange={handleSpeedChange}
                explanationMode={state.explanationMode}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
