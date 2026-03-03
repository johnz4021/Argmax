import { useState, useEffect, useRef, useCallback } from 'react';
import { useSpeechToText } from '../hooks/useSpeechToText';
import GuidedOptions from './GuidedOptions';
import MathText from './MathText';

export default function Controls({ status, onInterrupt, onPause, onResume, onRestart, onSpeedChange, explanationMode, guidedOptions, onGuidedResponse, mode, onGuidedMessage, guidedPrompt, registerInsertRef }) {
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
          onSelect={onGuidedResponse}
        />
      )}
      {isGuided && (guidedPrompt || (guidedOptions && guidedOptions.mode === 'open_ended')) && !(guidedOptions && guidedOptions.mode !== 'open_ended') && (
        <div className="text-sm text-gray-400 italic px-1">
          <MathText>{guidedOptions?.prompt || guidedPrompt}</MathText>
        </div>
      )}
      {showInput && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={placeholder}
            className={`flex-1 bg-gray-800 border rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 ${
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
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
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
      )}
    </div>
  );
}
