// Pre-teaching solver — solves the problem before the Socratic dialogue begins,
// giving the tutor a verified north star to guide toward.

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ maxRetries: 3 });

const SOLVER_SYSTEM_PROMPT = `You are an expert algorithm problem solver. Given a problem, solve it completely and rigorously. The problem may be provided as text, as an image (e.g. a screenshot of a textbook or competition problem), or both. If an image is provided, read and interpret it carefully.

Think deeply about the problem. Consider:
1. What is the optimal approach? (Not just the obvious one — consider if a non-obvious technique is needed)
2. What is the time/space complexity?
3. Is there a "paradigm shift" where the obvious approach fails and a non-obvious one is required?

You MUST call the submit_solution tool with your complete analysis. Do NOT respond with plain text — always use the submit_solution tool.`;

const SUBMIT_SOLUTION_TOOL = {
  name: 'submit_solution',
  description: 'Submit your complete solution analysis for the problem.',
  input_schema: {
    type: 'object',
    properties: {
      solution: {
        type: 'string',
        description: 'Complete solution with explanation of the approach and key steps.',
      },
      approach: {
        type: 'string',
        description: 'Short name for the approach (e.g., "XOR bit encoding", "Dijkstra reduction", "DP on subsets").',
      },
      complexity: {
        type: 'string',
        description: 'Time and space complexity (e.g., "O(n log n) time, O(n) space").',
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description: 'Confidence in the solution correctness.',
      },
      paradigmShift: {
        type: 'boolean',
        description: 'True if the obvious/naive approach won\'t achieve optimal complexity and a non-obvious technique is required.',
      },
      obviousApproach: {
        type: 'string',
        description: 'What approach most students would try first (e.g., "divide and conquer", "brute force BFS").',
      },
      keyInsight: {
        type: 'string',
        description: 'The single most important insight needed to solve this problem.',
      },
      selfCheckPassed: {
        type: 'boolean',
        description: 'Whether you verified your solution against sample cases or logical checks.',
      },
    },
    required: ['solution', 'approach', 'complexity', 'confidence', 'paradigmShift', 'obviousApproach', 'keyInsight', 'selfCheckPassed'],
  },
};

const SOLVER_TIMEOUT_MS = 300_000;

/**
 * Pre-solve a problem using extended thinking.
 * Returns { success: true, ...solutionFields } or { success: false }.
 */
export async function solveProblem(problemText, statusCallback, imageBase64, imageMimeType) {
  if (statusCallback) statusCallback('Analyzing problem...');

  try {
    // Build user message content blocks (supports text, image, or both)
    const userContent = [];
    if (imageBase64 && imageMimeType) {
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: imageMimeType, data: imageBase64 },
      });
    }
    const textPart = problemText
      ? `Solve this problem completely:\n\n${problemText}`
      : 'Solve the problem shown in the attached image completely.';
    userContent.push({ type: 'text', text: textPart });

    const responsePromise = anthropic.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: SOLVER_SYSTEM_PROMPT,
      tools: [SUBMIT_SOLUTION_TOOL],
      messages: [
        {
          role: 'user',
          content: userContent,
        },
      ],
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Solver timeout')), SOLVER_TIMEOUT_MS)
    );

    if (statusCallback) statusCallback('Deep analysis...');

    const response = await Promise.race([responsePromise, timeoutPromise]);

    // Extract the tool use block
    const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'submit_solution');
    if (!toolUse) {
      console.warn('[Solver] No submit_solution tool call in response');
      return { success: false };
    }

    const result = toolUse.input;
    console.log(`[Solver] Solved with approach="${result.approach}", confidence=${result.confidence}, paradigmShift=${result.paradigmShift}`);

    return { success: true, ...result };
  } catch (err) {
    console.error('[Solver] Failed:', err.message);
    return { success: false };
  }
}
