import { useState } from 'react';

export default function Controls({ status, onInterrupt, onRestart, onSpeedChange }) {
  const [question, setQuestion] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!question.trim()) return;
    onInterrupt(question.trim());
    setQuestion('');
  };

  return (
    <div className="border-t border-gray-800 px-4 py-3 space-y-3">
      {status === 'teaching' && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Ask
          </button>
        </form>
      )}

      {status === 'interrupted' && (
        <p className="text-sm text-yellow-400 animate-pulse">
          Waiting for answer...
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

      {(status === 'teaching' || status === 'interrupted') && (
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
