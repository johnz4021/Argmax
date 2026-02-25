import { useState } from 'react';
import AlgoSelector from './AlgoSelector';
import ProblemSolver from './ProblemSolver';

export default function LandingTabs({ onSelect, disabled }) {
  const [activeTab, setActiveTab] = useState('tutorials');

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-center gap-1 pt-6 pb-2">
        <button
          onClick={() => setActiveTab('tutorials')}
          className={`px-5 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
            activeTab === 'tutorials'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          Tutorials
        </button>
        <button
          onClick={() => setActiveTab('solver')}
          className={`px-5 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
            activeTab === 'solver'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          Problem Solver
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        {activeTab === 'tutorials' ? (
          <AlgoSelector onSelect={onSelect} disabled={disabled} />
        ) : (
          <ProblemSolver onSelect={onSelect} disabled={disabled} />
        )}
      </div>
    </div>
  );
}
