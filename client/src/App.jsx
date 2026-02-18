import { useCallback, useRef, useState } from 'react';
import GraphView from './components/GraphView';
import Transcript from './components/Transcript';
import Controls from './components/Controls';
import AlgoSelector from './components/AlgoSelector';
import { useWebSocket } from './hooks/useWebSocket';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { useTutorState } from './hooks/useTutorState';

export default function App() {
  const { state, processMessage, interrupt, reset } = useTutorState();
  const audioPlayer = useAudioPlayer();
  const [vizActions, setVizActions] = useState(null);

  const onMessage = useCallback(
    (msg) => {
      processMessage(msg);

      // Apply viz actions from segments
      if (msg.type === 'segment_start' && msg.viz_actions?.length > 0) {
        setVizActions(msg.viz_actions);
      }
      if (msg.type === 'interrupt_response' && msg.viz_actions?.length > 0) {
        setVizActions(msg.viz_actions);
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
      setVizActions(null);
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
    setVizActions(null);
  }, [reset, audioPlayer]);

  const handleSpeedChange = useCallback(
    (multiplier) => {
      send({ type: 'set_speed', multiplier });
    },
    [send]
  );

  const showSelector = state.status === 'idle' || state.status === 'error';

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
            {/* Graph panel - 60% */}
            <div className="w-3/5 border-r border-gray-800">
              <GraphView
                graph={state.graph}
                vizActions={vizActions}
                phase={state.currentPhase}
              />
            </div>

            {/* Transcript panel - 40% */}
            <div className="w-2/5 flex flex-col">
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
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
