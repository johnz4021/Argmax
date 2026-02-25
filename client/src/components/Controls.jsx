import { useState, useEffect } from 'react';
import { useSpeechToText } from '../hooks/useSpeechToText';
import GuidedOptions from './GuidedOptions';

export default function Controls({ status, onInterrupt, onPause, onResume, onRestart, onSpeedChange, explanationMode, guidedOptions, onGuidedResponse }) {
  const [question, setQuestion] = useState('');
  const [pausePending, setPausePending] = useState(false);
  const { isListening, transcript, isSupported, start, stop, clearTranscript } = useSpeechToText();

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
    onInterrupt(question.trim());
    setQuestion('');
    clearTranscript();
  };

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

  return (
    <div className="border-t border-gray-800 px-4 py-3 space-y-3">
      {guidedOptions && (
        <GuidedOptions
          options={guidedOptions.options}
          prompt={guidedOptions.prompt}
          onSelect={onGuidedResponse}
        />
      )}
      {showInput && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={status === 'complete' ? "Any questions about the lesson?" : "Ask a question..."}
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
            Ask
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
          <p className="text-sm text-green-400">Lesson complete!</p>
          <button
            onClick={onRestart}
            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            Restart
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
