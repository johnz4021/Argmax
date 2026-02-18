// Claude agent loop with tool dispatch

import Anthropic from '@anthropic-ai/sdk';
import { tools } from './tools.js';
import { runAlgorithm } from './algorithms.js';
import { synthesizeAndStream } from './tts.js';

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are AlgoTutor, an expert algorithm teacher. You teach graph algorithms step-by-step using visualizations.

Your teaching style:
- Warm, encouraging, conversational tone
- Explain concepts before diving into steps
- Use analogies when helpful
- After each step, briefly explain WHY it matters
- Keep narration segments to 1-3 sentences each for good pacing

Teaching flow:
1. First, call create_graph to set up the visualization
2. Give a brief introduction to the algorithm (1-2 segments)
3. Call run_algorithm to get the execution trace
4. Narrate each step using emit_segment, with appropriate viz_actions
5. After all steps, summarize the results with show_path visualizations

Rules:
- ALWAYS call run_algorithm to get the real trace. Never make up algorithm results.
- Each emit_segment should have relevant viz_actions to animate the graph
- Use mark_current for the node being processed
- Use highlight_edge when examining an edge
- Use mark_visited when done with a node
- Use set_label to show distance updates on nodes
- Use update_table to show the distance table
- Use show_path at the end to highlight shortest paths
- Use reset_highlights before showing final results
- Set appropriate phase labels to track progress
- Keep delay_ms between 300-1000 depending on complexity`;

function sendJSON(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function sendBinary(ws, buffer) {
  if (ws.readyState === ws.OPEN) {
    ws.send(buffer, { binary: true });
  }
}

export async function startAgentSession(session, algorithm, graph, source) {
  const { ws } = session;

  sendJSON(ws, { type: 'lesson_start', algorithm, source });

  const messages = [
    {
      role: 'user',
      content: `Please teach me ${algorithm}'s algorithm step by step. Use the default graph with nodes A-F. Start from node ${source}. Create the graph first, then run the algorithm and narrate each step with visualizations.`,
    },
  ];

  let continueLoop = true;
  while (continueLoop) {
    if (ws.readyState !== ws.OPEN) break;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') {
      continueLoop = false;
      sendJSON(ws, { type: 'lesson_complete' });
      break;
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults = [];
      let interrupted = false;

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        const result = await handleToolCall(session, block, graph, algorithm, source);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });

        // Check for interrupt after emit_segment
        if (block.name === 'emit_segment' && session.interruptFlag) {
          const interrupt = session.interruptFlag;
          session.interruptFlag = null;
          interrupted = true;

          // Add remaining tool results for any unprocessed tool_use blocks
          for (const remaining of response.content) {
            if (remaining.type !== 'tool_use') continue;
            if (toolResults.some((r) => r.tool_use_id === remaining.id)) continue;
            toolResults.push({
              type: 'tool_result',
              tool_use_id: remaining.id,
              content: JSON.stringify({ skipped: true, reason: 'learner interrupt' }),
            });
          }

          // Append interrupt info as a text block in the same user message
          toolResults.push({
            type: 'text',
            text: `[LEARNER INTERRUPT] The learner has a question: "${interrupt.question}". Please use respond_to_interrupt to answer their question, then continue teaching from where you left off.`,
          });

          messages.push({ role: 'user', content: [...toolResults] });
          break;
        }
      }

      if (!interrupted && toolResults.length > 0) {
        messages.push({ role: 'user', content: toolResults });
      }
    }
  }
}

async function handleToolCall(session, toolCall, graph, algorithm, source) {
  const { ws } = session;
  const { name, input } = toolCall;

  switch (name) {
    case 'create_graph': {
      const graphData = {
        nodes: input.nodes || graph.nodes,
        edges: input.edges || graph.edges,
        positions: input.positions || graph.positions,
      };
      sendJSON(ws, { type: 'create_graph', graph: graphData });
      return { success: true, message: 'Graph created and displayed to learner.' };
    }

    case 'run_algorithm': {
      const algo = input.algorithm || algorithm;
      const src = input.source || source;
      const trace = runAlgorithm(algo, graph, src);
      return {
        success: true,
        algorithm: algo,
        source: src,
        trace,
        step_count: trace.length,
        message: `Algorithm executed successfully. ${trace.length} steps in trace. Use emit_segment to narrate each step.`,
      };
    }

    case 'emit_segment': {
      const segmentId = Math.random().toString(36).slice(2, 8);

      sendJSON(ws, {
        type: 'segment_start',
        segment_id: segmentId,
        narration: input.narration,
        viz_actions: input.viz_actions || [],
        phase: input.phase || '',
      });

      // TTS or simulated delay
      const sendBinaryFn = (buffer) => sendBinary(ws, buffer);
      const sendJsonFn = (obj) => sendJSON(ws, obj);
      await synthesizeAndStream(sendBinaryFn, input.narration, session.speedMultiplier, sendJsonFn);

      const delayMs = (input.delay_ms || 500) / session.speedMultiplier;
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      sendJSON(ws, { type: 'segment_end', segment_id: segmentId });

      return {
        success: true,
        message: 'Segment delivered. Narration played and animations applied.',
      };
    }

    case 'respond_to_interrupt': {
      sendJSON(ws, {
        type: 'interrupt_response',
        answer: input.answer,
        viz_actions: input.viz_actions || [],
      });

      const sendBinaryFn = (buffer) => sendBinary(ws, buffer);
      const sendJsonFn = (obj) => sendJSON(ws, obj);
      await synthesizeAndStream(sendBinaryFn, input.answer, session.speedMultiplier, sendJsonFn);
      await new Promise((resolve) => setTimeout(resolve, 500));

      return {
        success: true,
        message: 'Interrupt response delivered. Continue teaching from where you left off.',
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
