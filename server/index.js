import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { DEFAULT_GRAPH } from './algorithms.js';
import { startAgentSession } from './agent.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3001;

const sessions = new Map();

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

wss.on('connection', (ws) => {
  const sessionId = generateId();
  const session = {
    id: sessionId,
    ws,
    interruptFlag: null,
    pauseFlag: false,
    pauseResolver: null,
    active: false,
    speedMultiplier: 1,
  };
  sessions.set(sessionId, session);
  console.log(`[WS] Client connected: ${sessionId}`);

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`[WS] Received:`, msg.type);

      switch (msg.type) {
        case 'start_lesson': {
          if (session.active) {
            ws.send(JSON.stringify({ type: 'error', message: 'Lesson already in progress' }));
            return;
          }
          session.active = true;
          const algorithm = msg.algorithm || 'dijkstra';
          const graph = msg.graph || DEFAULT_GRAPH;
          const source = msg.source || 'A';

          try {
            await startAgentSession(session, algorithm, graph, source);
          } catch (err) {
            console.error('[Agent] Error:', err);
            ws.send(JSON.stringify({ type: 'error', message: 'Agent session failed: ' + err.message }));
          }
          session.active = false;
          break;
        }

        case 'interrupt': {
          if (!session.active) return;
          session.interruptFlag = {
            question: msg.question,
            timestamp: Date.now(),
          };
          console.log(`[WS] Interrupt queued: "${msg.question}"`);
          break;
        }

        case 'pause': {
          if (!session.active) return;
          session.pauseFlag = true;
          console.log(`[WS] Pause requested`);
          break;
        }

        case 'resume': {
          if (session.pauseResolver) {
            session.pauseResolver();
            session.pauseResolver = null;
          }
          console.log(`[WS] Resume requested`);
          break;
        }

        case 'set_speed': {
          session.speedMultiplier = msg.multiplier || 1;
          break;
        }
      }
    } catch (err) {
      console.error('[WS] Message parse error:', err);
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected: ${sessionId}`);
    session.active = false;
    sessions.delete(sessionId);
  });
});

server.listen(PORT, () => {
  console.log(`[Server] Argmax running on http://localhost:${PORT}`);
});
