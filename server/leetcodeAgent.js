import Anthropic from '@anthropic-ai/sdk';
import { ALGORITHMS } from './algorithms/registry.js';

const client = new Anthropic();

const VALID_ALGORITHM_KEYS = Object.keys(ALGORITHMS);

const EXTRACTION_TOOL = {
  name: 'extract_leetcode_problem',
  description: 'Extract structured information from a LeetCode problem statement.',
  input_schema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'The problem title, e.g. "Number of Islands"',
      },
      problem_summary: {
        type: 'string',
        description: '1-2 sentence description of what the problem asks',
      },
      algorithm_key: {
        type: 'string',
        description: `The primary algorithm key that solves this problem. Must be one of: ${VALID_ALGORITHM_KEYS.join(', ')}. Use null if none apply.`,
        enum: [...VALID_ALGORITHM_KEYS, null],
      },
      confidence: {
        type: 'number',
        description: 'Confidence score 0.0-1.0 that the algorithm_key is correct',
      },
      test_case: {
        type: 'object',
        description: 'The Example 1 test case formatted to match the algorithm\'s input signature. See format examples in the prompt.',
      },
      test_case_source: {
        type: 'string',
        enum: ['example_1', 'example_2', 'generated'],
        description: 'Which example was used as the test case',
      },
      fallback_reason: {
        type: 'string',
        description: 'If algorithm_key is null or confidence < 0.7, explain why. Otherwise null.',
      },
    },
    required: ['title', 'problem_summary', 'algorithm_key', 'confidence', 'test_case', 'test_case_source'],
  },
};

const EXTRACTION_SYSTEM_PROMPT = `You are an algorithm classifier for a LeetCode visualization tool. Given a LeetCode problem statement, extract:
1. The primary algorithm that solves it
2. The Example 1 test case in the exact input format required by that algorithm

ALGORITHM KEY → INPUT FORMAT EXAMPLES:

bfs / dfs / dijkstra / bellman_ford / kruskal / prim / maxflow / dag_shortest / union_find:
  Input: { "graph": { "nodes": [{"id": "0"}, {"id": "1"}, ...], "edges": [{"source": "0", "target": "1"}, ...], "directed": false }, "source": "0" }
  Graph edges: always use string node IDs. For weighted: add "weight" field on each edge.
  Example — Number of Islands (bfs): convert 2D grid to graph nodes (row_col IDs), edges between adjacent 1s.

sliding_window:
  Input: { "array": [1, 2, 3, 4, 5], "window_size": 3 }
  Use for: Maximum sum subarray of size k, Longest substring without repeating characters (use window_size = inferred k from problem).

heap_ops:
  Input: { "operations": [{"type": "insert", "value": 5}, {"type": "extract_min"}] }
  Use for: Top-K problems, Kth largest element, merge K sorted lists.

trie:
  Input: { "operations": [{"type": "insert", "word": "apple"}, {"type": "search", "word": "app"}] }
  Use for: Word search, Implement Trie, autocomplete problems.

mergesort:
  Input: { "array": [38, 27, 43, 3, 9] }

knapsack:
  Input: { "items": [{"name": "A", "weight": 2, "value": 3}], "capacity": 5 }

edit_distance:
  Input: { "str1": "kitten", "str2": "sitting" }

RULES:
- Prefer graph algorithms (bfs/dfs) for grid/matrix traversal problems — convert grid to graph
- Use confidence >= 0.7 only when you are certain of the algorithm
- Truncate test cases that exceed algorithm capability limits (max_nodes: 12 for graphs, max_array_length: 15 for arrays, max_words: 10 for trie, max_ops: 10 for heap)
- For graphs with more than 12 nodes: BFS from source node, keep only the first 12 reachable nodes and edges between them
- If the problem has multiple valid algorithms, pick the most canonical one
- Use null algorithm_key for DP/greedy/bit manipulation problems not covered by the registry`;

/**
 * Parse a LeetCode problem statement into structured extraction.
 * Returns { title, algorithm_key, confidence, test_case, test_case_source, fallback_reason }
 * Throws on timeout or API error.
 */
export async function parseLeetcodeProblem(problemText, anthropicClient) {
  const apiClient = anthropicClient || client;

  const extraction = await Promise.race([
    apiClient.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: EXTRACTION_SYSTEM_PROMPT,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: 'any' },
      messages: [
        {
          role: 'user',
          content: `Extract the algorithm and test case from this LeetCode problem:\n\n${problemText}`,
        },
      ],
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('parseLeetcodeProblem timeout')), 10000)
    ),
  ]);

  const toolUse = extraction.content.find(b => b.type === 'tool_use');
  if (!toolUse) {
    throw new Error('No tool_use block in extraction response');
  }

  return toolUse.input;
}
