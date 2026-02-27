import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ maxRetries: 5 });

const AUTHOR_SYSTEM_PROMPT = `You write algorithm trace generators in JavaScript.

Given an algorithm name and a target renderer type, produce a JavaScript function
that ACTUALLY EXECUTES the algorithm and returns a step-by-step trace array.

Function signature: function run(input) { ... return trace; }

Each trace step must have:
- type: string (action category, e.g., 'compare', 'swap', 'visit_node')
- description: string (human-readable explanation of this step)
- Additional fields specific to the step type

The function must CORRECTLY implement the algorithm. Use proper data structures.
Do not simulate or approximate.

RENDERER-SPECIFIC STEP TYPES:

For renderer 'graph':
  Steps should include: init, visit_node, examine_edge, relax/update, result
  Each step should have: { node?, from?, to?, weight?, distances?, visited? }
  Input: { graph: { nodes: [{id}], edges: [{source, target, weight}] }, source: string }

For renderer 'array':
  Steps should include: init, compare, swap, partition, mark_sorted, result
  Each step should have: { indices?, values?, array? (snapshot) }
  Input: { array: number[] }

For renderer 'table':
  Steps should include: init_table, fill_cell, skip_cell, traceback, result
  Each step should have: { row?, col?, value?, from? (dependency cells) }
  Input depends on algorithm

For renderer 'tree':
  Steps should include: init, traverse, insert, rotate, recolor, result
  Each step should have: { node?, parent?, side?, direction? }
  Input depends on algorithm

Output ONLY the function wrapped in: \`\`\`javascript ... \`\`\`
No explanation. No imports. Pure function.`;

/**
 * Generate a trace generator function for an algorithm.
 * Returns the function code as a string.
 */
export async function generateTraceGenerator(algorithmName, renderer, description, context) {
  let userContent = `Write a trace generator for: ${algorithmName}
Target renderer: ${renderer}
Description: ${description || algorithmName}
Input format: The function receives an object with algorithm-specific fields.`;

  if (context) {
    if (context.modelContract) {
      userContent += `\n\nModel contract (internal reasoning about the problem reduction):\n${JSON.stringify(context.modelContract, null, 2)}`;
    }
    if (context.failureReason) {
      userContent += `\n\nPrevious attempt failed: ${context.failureReason}`;
    }
    if (context.closestAlgorithm) {
      userContent += `\nClosest registered algorithm: ${context.closestAlgorithm}`;
    }
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: AUTHOR_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userContent,
      },
    ],
  });

  const text = response.content[0].text;
  const match = text.match(/```javascript\n([\s\S]*?)```/);
  if (!match) throw new Error('Author agent did not produce valid code');

  return match[1].trim();
}
