/**
 * Classification decision tree for guided problem solving.
 * Helps the agent guide students through algorithm identification.
 */

const CLASSIFICATION_TREE = {
  question: 'What is the core structure of this problem?',
  children: [
    {
      label: 'Graph',
      question: 'What are you trying to find in the graph?',
      children: [
        {
          label: 'Shortest path',
          question: 'Are the edge weights all equal (or unweighted)?',
          children: [
            { label: 'Yes (unweighted)', leaf: 'bfs' },
            {
              label: 'No (weighted, non-negative)',
              leaf: 'dijkstra',
            },
          ],
        },
        {
          label: 'Spanning tree (connect all nodes cheaply)',
          question: 'Do you want to grow from a start node or sort edges globally?',
          children: [
            { label: 'Grow from a node', leaf: 'prim' },
            { label: 'Sort edges globally', leaf: 'kruskal' },
          ],
        },
        {
          label: 'Maximum flow / matching',
          leaf: 'maxflow',
        },
        {
          label: 'Traversal / reachability',
          question: 'Do you need shortest distances, or just reachability/ordering?',
          children: [
            { label: 'Just reachability or ordering', leaf: 'dfs' },
            { label: 'Shortest distances (unweighted)', leaf: 'bfs' },
          ],
        },
      ],
    },
    {
      label: 'Optimization (choose best subset/sequence)',
      question: 'What kind of optimization?',
      children: [
        {
          label: 'Select items with weight/value tradeoff',
          leaf: 'knapsack',
        },
        {
          label: 'Find longest common subsequence',
          leaf: 'lcs',
        },
        {
          label: 'Transform one string to another',
          leaf: 'edit_distance',
        },
        {
          label: 'Make change with fewest coins',
          leaf: 'coin_change',
        },
      ],
    },
    {
      label: 'Sorting / Searching',
      question: 'Do you need to sort data or search within sorted data?',
      children: [
        {
          label: 'Sort data',
          question: 'Any preference on sorting approach?',
          children: [
            { label: 'Divide and conquer (fast)', leaf: 'quicksort' },
            { label: 'Divide and conquer (stable)', leaf: 'mergesort' },
            { label: 'Simple / educational', leaf: 'insertion_sort' },
          ],
        },
        {
          label: 'Search in sorted data',
          leaf: 'binary_search',
        },
      ],
    },
    {
      label: 'Data structures',
      question: 'What data structure operation?',
      children: [
        { label: 'Binary search tree insertion', leaf: 'bst_insert' },
        { label: 'Heap / priority queue', leaf: 'heap_operations' },
        { label: 'Linked list reversal', leaf: 'linked_list_reversal' },
        { label: 'Stack operations', leaf: 'stack_operations' },
      ],
    },
    {
      label: 'Math / Number theory',
      question: 'What mathematical operation?',
      children: [
        { label: 'Greatest common divisor', leaf: 'gcd' },
      ],
    },
  ],
};

/**
 * Serialize the classification tree into text for the LLM prompt.
 * Shows the hierarchical decision structure.
 */
export function treeToPromptText() {
  const lines = [];

  function walk(node, depth = 0) {
    const indent = '  '.repeat(depth);
    if (node.question) {
      lines.push(`${indent}Q: "${node.question}"`);
    }
    if (node.leaf) {
      lines.push(`${indent}=> ALGORITHM: ${node.leaf}`);
      return;
    }
    if (node.children) {
      for (const child of node.children) {
        lines.push(`${indent}- "${child.label}"`);
        walk(child, depth + 1);
      }
    }
  }

  walk(CLASSIFICATION_TREE);
  return lines.join('\n');
}

export { CLASSIFICATION_TREE };
