const ALGORITHMS = [
  { id: 'dijkstra', name: "Dijkstra's Shortest Path", description: 'Find shortest paths from a source node' },
  { id: 'bfs', name: 'Breadth-First Search', description: 'Explore nodes level by level' },
  { id: 'dfs', name: 'Depth-First Search', description: 'Explore as deep as possible first' },
];

export default function AlgoSelector({ onSelect, disabled }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-100 mb-2">AlgoTutor</h1>
        <p className="text-gray-400">Choose an algorithm to learn</p>
      </div>

      <div className="grid gap-3 w-full max-w-sm">
        {ALGORITHMS.map((algo) => (
          <button
            key={algo.id}
            onClick={() => onSelect(algo.id)}
            disabled={disabled}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-blue-500 rounded-xl p-4 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="font-medium text-gray-100">{algo.name}</div>
            <div className="text-sm text-gray-400 mt-1">{algo.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
