import { useState } from 'react';

export default function ProblemSolver({ onSelect, disabled }) {
  const [problemText, setProblemText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!problemText.trim() || disabled) return;
    onSelect('guided', { problemText: problemText.trim() });
  };

  return (
    <div className="flex flex-col items-center h-full gap-6 p-8 overflow-auto">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-100 mb-2">Problem Solver</h1>
        <p className="text-gray-400">Paste a problem and I'll guide you through it</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-4">
        <textarea
          value={problemText}
          onChange={(e) => setProblemText(e.target.value)}
          placeholder="Paste your homework problem, competition question, or describe what you want to explore..."
          rows={8}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-y"
        />
        <button
          type="submit"
          disabled={!problemText.trim() || disabled}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Guide Me
        </button>
      </form>
    </div>
  );
}
