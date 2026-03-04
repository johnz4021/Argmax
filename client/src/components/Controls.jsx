import { useState, useEffect, useRef, useCallback } from 'react';
import { useSpeechToText } from '../hooks/useSpeechToText';
import GuidedOptions from './GuidedOptions';
import MathText from './MathText';

export default function Controls({ status, agentStatus, onInterrupt, onPause, onResume, onRestart, onSpeedChange, onTtsMuteToggle, ttsMuted, explanationMode, guidedOptions, onGuidedResponse, mode, onGuidedMessage, guidedPrompt, registerInsertRef }) {
  const [question, setQuestion] = useState('');
  const [pausePending, setPausePending] = useState(false);
  const { isListening, transcript, isSupported, start, stop, clearTranscript } = useSpeechToText();
  const inputRef = useRef(null);

  // Register input ref for clickable graph element insertion (Phase 7)
  useEffect(() => {
    if (registerInsertRef) {
      registerInsertRef(inputRef);
    }
  }, [registerInsertRef]);

  // Populate input field when speech transcript updates
  useEffect(() => {
    if (transcript) {
      setQuestion(transcript);
    }
  }, [transcript]);

  // Clear pausePending once the server confirms pause (status becomes 'paused')
  useEffect(() => {
    if (status === 'paused') {
      setPausePending(false);
    }
  }, [status]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!question.trim()) return;
    if (mode === 'guided' && guidedOptions?.mode === 'open_ended' && onGuidedResponse) {
      // Open-ended guided question — route through guided response handler
      onGuidedResponse({ text: question.trim() });
    } else if (mode === 'guided' && onGuidedMessage) {
      onGuidedMessage(question.trim());
    } else {
      onInterrupt(question.trim());
    }
    setQuestion('');
    clearTranscript();
    // Reset textarea height after clearing
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const insertAtCursor = useCallback((text) => {
    const el = inputRef.current;
    if (!el) {
      setQuestion((prev) => prev + text);
      return;
    }
    const start = el.selectionStart || 0;
    const end = el.selectionEnd || 0;
    const current = question;
    const newValue = current.slice(0, start) + text + current.slice(end);
    setQuestion(newValue);
    // Restore cursor position after React re-renders
    requestAnimationFrame(() => {
      el.selectionStart = el.selectionEnd = start + text.length;
      el.focus();
    });
  }, [question]);

  // Expose insertAtCursor for external use (Phase 7)
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current._insertAtCursor = insertAtCursor;
    }
  }, [insertAtCursor]);

  const handlePause = () => {
    setPausePending(true);
    onPause();
  };

  const toggleMic = () => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  };

  const showInput = status === 'teaching' || status === 'paused' || status === 'complete';
  const isGuided = mode === 'guided';
  // Disable sending when the model is thinking/running tools (not waiting for input)
  const agentBusy = isGuided && !!agentStatus;
  const placeholder = isGuided
    ? (guidedOptions?.mode === 'open_ended' && guidedOptions?.input_placeholder)
      ? guidedOptions.input_placeholder
      : 'Type your thoughts...'
    : status === 'complete'
      ? 'Any questions about the lesson?'
      : 'Ask a question...';

  return (
    <div className="border-t border-gray-800 px-4 py-3 space-y-3">
      {guidedOptions && guidedOptions.mode !== 'open_ended' && (
        <GuidedOptions
          options={guidedOptions.options}
          prompt={guidedOptions.prompt}
          mode={guidedOptions.mode}
          inputPlaceholder={guidedOptions.input_placeholder}
          multiSelect={guidedOptions.multiSelect}
          onSelect={onGuidedResponse}
          disabled={agentBusy}
        />
      )}
      {isGuided && (guidedPrompt || (guidedOptions && guidedOptions.mode === 'open_ended')) && !(guidedOptions && guidedOptions.mode !== 'open_ended') && (
        <div className="text-sm text-gray-400 italic px-1">
          <MathText>{guidedOptions?.prompt || guidedPrompt}</MathText>
        </div>
      )}
      {showInput && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            disabled={agentBusy}
            placeholder={agentBusy ? 'Waiting for tutor...' : placeholder}
            className={`flex-1 bg-gray-800 border rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none max-h-32 overflow-y-auto ${
              agentBusy ? 'opacity-50 cursor-not-allowed' : ''
            } ${
              isListening ? 'border-red-500' : 'border-gray-700'
            }`}
          />
          {isSupported && (
            <button
              type="button"
              onClick={toggleMic}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isListening
                  ? 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
              }`}
              title={isListening ? 'Stop listening' : 'Speak your question'}
            >
              {isListening ? (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  Mic
                </span>
              ) : (
                'Mic'
              )}
            </button>
          )}
          <button
            type="submit"
            disabled={agentBusy}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              agentBusy
                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {isGuided ? 'Send' : 'Ask'}
          </button>
        </form>
      )}

      {status === 'teaching' && (
        <div className="flex items-center gap-2">
          <button
            onClick={handlePause}
            disabled={pausePending}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              pausePending
                ? 'bg-yellow-800 text-yellow-300 cursor-not-allowed'
                : 'bg-yellow-600 hover:bg-yellow-500 text-white'
            }`}
          >
            {pausePending ? (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 bg-yellow-300 rounded-full animate-pulse" />
                Pausing...
              </span>
            ) : (
              'Pause'
            )}
          </button>
        </div>
      )}

      {status === 'paused' && (
        <button
          onClick={onResume}
          className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Resume
        </button>
      )}

      {status === 'interrupted' && (
        <p className="text-sm text-yellow-400 animate-pulse">
          Waiting for answer...
        </p>
      )}

      {explanationMode && (
        <p className="text-sm text-purple-400 flex items-center gap-2">
          <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
          Showing explanation...
        </p>
      )}

      {status === 'complete' && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-green-400">Lesson complete! Ask any follow-up questions below.</p>
          <button
            onClick={onRestart}
            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            New Problem
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-3">
          <p className="text-sm text-red-400">An error occurred.</p>
          <button
            onClick={onRestart}
            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {(status === 'teaching' || status === 'paused' || status === 'interrupted') && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Speed:</label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.25"
              defaultValue="1"
              onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
              className="w-24 accent-blue-500"
            />
          </div>
          <button
            onClick={onTtsMuteToggle}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
              ttsMuted
                ? 'bg-red-900/50 text-red-400 hover:bg-red-900/70'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
            title={ttsMuted ? 'Unmute voice' : 'Mute voice'}
          >
            {ttsMuted ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M9.547 3.062A.75.75 0 0110 3.75v12.5a.75.75 0 01-1.264.546L5.203 13.5H2.667a.75.75 0 01-.7-.48A6.985 6.985 0 011.5 10c0-.98.201-1.916.467-2.52a.75.75 0 01.7-.48h2.536l3.533-3.296a.75.75 0 01.811-.142z" />
                  <path d="M13.28 7.22a.75.75 0 10-1.06 1.06L13.94 10l-1.72 1.72a.75.75 0 101.06 1.06L15 11.06l1.72 1.72a.75.75 0 101.06-1.06L16.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L15 8.94l-1.72-1.72z" />
                </svg>
                TTS Off
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M10 3.75a.75.75 0 00-1.264-.546L5.203 6.5H2.667a.75.75 0 00-.7.48 6.985 6.985 0 000 6.04.75.75 0 00.7.48h2.536l3.533 3.296A.75.75 0 0010 16.25V3.75zM15.95 5.05a.75.75 0 00-1.06 1.061 5.5 5.5 0 010 7.778.75.75 0 001.06 1.06 7 7 0 000-9.899z" />
                  <path d="M13.829 7.172a.75.75 0 00-1.061 1.06 2.5 2.5 0 010 3.536.75.75 0 001.06 1.06 4 4 0 000-5.656z" />
                </svg>
                TTS On
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
