const ALGORITHM_GROUPS = [
  {
    category: 'Graph Algorithms',
    algorithms: [
      { id: 'dijkstra', name: "Dijkstra's Shortest Path", description: 'Find shortest paths from a source node' },
      { id: 'bfs', name: 'Breadth-First Search', description: 'Explore nodes level by level' },
      { id: 'dfs', name: 'Depth-First Search', description: 'Explore as deep as possible first' },
      { id: 'kruskal', name: "Kruskal's MST", description: 'Build minimum spanning tree by sorted edges' },
      { id: 'prim', name: "Prim's MST", description: 'Grow minimum spanning tree from a source' },
    ],
  },
  {
    category: 'Sorting',
    algorithms: [
      { id: 'quicksort', name: 'Quicksort', description: 'Divide and conquer with pivot partitioning' },
      { id: 'mergesort', name: 'Merge Sort', description: 'Divide and conquer with sorted merging' },
      { id: 'insertion_sort', name: 'Insertion Sort', description: 'Build sorted array one element at a time' },
      { id: 'selection_sort', name: 'Selection Sort', description: 'Find minimum, place it, repeat' },
      { id: 'bubble_sort', name: 'Bubble Sort', description: 'Repeatedly swap adjacent out-of-order elements' },
    ],
  },
  {
    category: 'Searching',
    algorithms: [
      { id: 'binary_search', name: 'Binary Search', description: 'Efficiently find a target in a sorted array' },
    ],
  },
  {
    category: 'Dynamic Programming',
    algorithms: [
      { id: 'knapsack', name: '0/1 Knapsack', description: 'Maximize value within a weight constraint' },
      { id: 'lcs', name: 'Longest Common Subsequence', description: 'Find longest shared subsequence of two strings' },
      { id: 'edit_distance', name: 'Edit Distance', description: 'Minimum edits to transform one string to another' },
      { id: 'coin_change', name: 'Coin Change', description: 'Minimum coins to make a given amount' },
    ],
  },
  {
    category: 'Trees',
    algorithms: [
      { id: 'bst_insert', name: 'BST Insertion', description: 'Build a binary search tree by sequential insertion' },
      { id: 'heap_operations', name: 'Min-Heap Operations', description: 'Insert and extract-min on a binary min-heap' },
    ],
  },
  {
    category: 'Linked Structures',
    algorithms: [
      { id: 'linked_list_reversal', name: 'Linked List Reversal', description: 'Reverse a singly linked list in-place' },
      { id: 'stack_operations', name: 'Stack Operations', description: 'Push, pop, and peek on a stack' },
      { id: 'queue_operations', name: 'Queue Operations', description: 'Enqueue, dequeue, and peek on a queue' },
    ],
  },
];

export default function AlgoSelector({ onSelect, disabled }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 p-8 overflow-auto">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-100 mb-2">AlgoTutor</h1>
        <p className="text-gray-400">Choose an algorithm to learn</p>
      </div>

      <div className="w-full max-w-lg space-y-6">
        {ALGORITHM_GROUPS.map((group) => (
          <div key={group.category}>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {group.category}
            </h2>
            <div className="grid gap-2">
              {group.algorithms.map((algo) => (
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
        ))}
      </div>
    </div>
  );
}
