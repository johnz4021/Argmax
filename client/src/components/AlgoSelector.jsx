const VISIBLE_GROUPS = [
  {
    category: 'Algorithmic Foundations',
    algorithms: [
      { id: 'gcd', name: 'GCD (Euclid)', description: 'Find greatest common divisor using the Euclidean algorithm [1.2]' },
    ],
  },
  {
    category: 'Divide and Conquer',
    algorithms: [
      { id: 'binary_search', name: 'Binary Search', description: 'Efficiently find a target in a sorted array [2.3]' },
      { id: 'mergesort', name: 'Merge Sort', description: 'Divide and conquer with sorted merging [2.3]' },
    ],
  },
  {
    category: 'Graphs',
    algorithms: [
      { id: 'dfs', name: 'Depth-First Search', description: 'Explore as deep as possible first [3.2, 4.1]' },
      { id: 'bfs', name: 'Breadth-First Search', description: 'Explore nodes level by level [4.2]' },
      { id: 'dijkstra', name: "Dijkstra's Algorithm", description: 'Find shortest paths from a source node [4.4, 4.5]' },
    ],
  },
  {
    category: 'Greedy Algorithms',
    algorithms: [
      { id: 'kruskal', name: "Kruskal's Algorithm", description: 'Build minimum spanning tree by sorted edges [5.1.3]' },
      { id: 'prim', name: "Prim's Algorithm", description: 'Grow minimum spanning tree from a source [5.1.5]' },
    ],
  },
  {
    category: 'Dynamic Programming',
    algorithms: [
      { id: 'bellman_ford', name: 'Bellman-Ford', description: 'Shortest paths with negative-weight edges [4.6]' },
      { id: 'knapsack', name: '0/1 Knapsack', description: 'Maximize value within a weight constraint [6.4]' },
      { id: 'edit_distance', name: 'Edit Distance', description: 'Minimum edits to transform one string to another [6.3]' },
    ],
  },
  {
    category: 'Network Flow',
    algorithms: [
      { id: 'maxflow', name: 'Ford-Fulkerson Max Flow', description: 'Find maximum flow and minimum cut in a network [7.2]' },
    ],
  },
  {
    category: 'Trees',
    algorithms: [
      { id: 'bst_insert', name: 'BST Insert', description: 'Insert values into a binary search tree' },
    ],
  },
];

export default function AlgoSelector({ onSelect, disabled }) {
  return (
    <div className="flex flex-col items-center h-full gap-8 p-8 overflow-auto">
      <div className="text-center">
        <h1 className="text-2xl font-display font-semibold text-text-primary mb-2">
          What would you like to learn?
        </h1>
        <p className="text-text-secondary font-body">Choose an algorithm to get started</p>
      </div>

      <div className="w-full max-w-lg space-y-6">
        {VISIBLE_GROUPS.map((group) => (
          <div key={group.category}>
            <span className="inline-block text-xs font-medium text-text-tertiary uppercase tracking-wider mb-3 px-2 py-0.5 rounded-full bg-surface-2 border border-border">
              {group.category}
            </span>
            <div className="grid gap-2">
              {group.algorithms.map((algo) => (
                <button
                  key={algo.id}
                  onClick={() => onSelect(algo.id)}
                  disabled={disabled}
                  className="bg-surface-2 hover:bg-surface-3 border border-border hover:border-accent/40 rounded-xl p-4 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <div className="font-display font-medium text-text-primary group-hover:text-accent transition-colors">{algo.name}</div>
                  <div className="text-sm text-text-secondary font-body mt-1">{algo.description}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
