import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { parse as parseUrl } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_GRAPH } from './algorithms.js';
import { startAgentSession } from './agent.js';
import { startGuidedSession, resumeGuidedSession } from './guidedAgent.js';
import Anthropic from '@anthropic-ai/sdk';
import { verifyJWT } from './supabase.js';
import { createConversation, listConversations, loadConversationMessages, loadAgentState, countConversations, getUserSettings, saveUserSettings, saveFeedback } from './db.js';
import { encrypt, decrypt } from './crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);

// Serve static client build
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

// Feedback / help request endpoint
app.post('/api/feedback', (req, res) => {
  const { name, email, message, category } = req.body;
  console.log(`[Feedback] From: ${name || 'anonymous'} <${email || 'no email'}>\n  ${message}`);

  const detected = category
    || (message && message.startsWith('[Algorithm Request]') ? 'algorithm_request' : 'help');
  saveFeedback(detected, { name, email, message, meta: req.body.meta });

  res.json({ ok: true });
});

// Session feedback endpoint
app.post('/api/session-feedback', (req, res) => {
  const { rating, message, mode, algorithm } = req.body;
  console.log(`[SessionFeedback] rating=${rating} mode=${mode} algo=${algorithm}`);
  saveFeedback('session_rating', { rating, message, meta: { mode, algorithm } });
  res.json({ ok: true });
});

const authEnabled = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

// Use noServer so we handle the upgrade ourselves — avoids Vite proxy ECONNRESET noise
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.PORT || 3001;

const FREE_SESSION_LIMIT = 20;

const sessions = new Map();

async function checkSessionGate(session) {
  if (!session.userId) return { allowed: true };
  const count = await countConversations(session.userId);
  if (count < FREE_SESSION_LIMIT) return { allowed: true, remaining: FREE_SESSION_LIMIT - count };
  const settings = await getUserSettings(session.userId);
  if (settings?.anthropic_api_key_encrypted) return { allowed: true, byok: true };
  return { allowed: false, count };
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

// Handle HTTP upgrade manually
server.on('upgrade', async (req, socket, head) => {
  if (authEnabled) {
    try {
      const { query } = parseUrl(req.url, true);
      const token = query.token;

      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const user = await verifyJWT(token);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      if (user.email && !user.email.toLowerCase().endsWith('.edu')) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      req.user = user;
    } catch (err) {
      console.error('[WS] Auth error during upgrade:', err.message);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
      return;
    }
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws, req) => {
  const sessionId = generateId();
  const user = req.user || null;
  const session = {
    id: sessionId,
    ws,
    userId: user?.id || null,
    userEmail: user?.email || null,
    interruptFlag: null,
    pauseFlag: false,
    pauseResolver: null,
    endSessionFlag: false,
    active: false,
    mode: 'direct',
    speedMultiplier: 1,
    ttsMuted: false,
    guidedResponse: null,
    guidedResponseResolver: null,
    guidedMessageQueue: [],
    followUpResolver: null,
    followUpSent: false,
    conversationId: null,
    runGeneration: 0,
  };
  sessions.set(sessionId, session);
  console.log(`[WS] Client connected: ${sessionId}${user ? ` (${user.email})` : ''}`);

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`[WS] Received:`, msg.type);

      switch (msg.type) {
        case 'start_lesson': {
          if (session.active && !session.endSessionFlag) {
            ws.send(JSON.stringify({ type: 'error', message: 'Lesson already in progress' }));
            return;
          }
          // Force-release a dying session (endSessionFlag is set but solver/API call still pending)
          session.active = false;
          session.endSessionFlag = false;
          session.runGeneration++;
          const lessonGen = session.runGeneration;
          {
            const gate = await checkSessionGate(session);
            if (!gate.allowed) {
              ws.send(JSON.stringify({ type: 'session_limit_reached', count: gate.count, limit: FREE_SESSION_LIMIT }));
              return;
            }
            if (gate.byok) {
              const settings = await getUserSettings(session.userId);
              const apiKey = decrypt(settings.anthropic_api_key_encrypted);
              session.anthropicClient = new Anthropic({ apiKey, maxRetries: 5 });
            }
          }
          session.active = true;
          const algorithm = msg.algorithm || 'dijkstra';
          const graph = msg.graph || DEFAULT_GRAPH;
          const source = msg.source || 'A';

          try {
            await startAgentSession(session, algorithm, graph, source);
          } catch (err) {
            if (err.message === '__end_session__') {
              console.log('[Agent] Session ended by user');
            } else {
              console.error('[Agent] Error:', err);
              ws.send(JSON.stringify({ type: 'error', message: 'Agent session failed: ' + err.message }));
            }
          }
          // Only clean up if this run is still the current one (not superseded)
          if (session.runGeneration === lessonGen) {
            session.active = false;
            session.endSessionFlag = false;
            ws.send(JSON.stringify({ type: 'session_ended' }));
          }
          break;
        }

        case 'start_guided': {
          if (session.active && !session.endSessionFlag) {
            ws.send(JSON.stringify({ type: 'error', message: 'Session already in progress' }));
            return;
          }
          session.active = false;
          session.endSessionFlag = false;
          session.runGeneration++;
          const guidedGen = session.runGeneration;
          {
            const gate = await checkSessionGate(session);
            if (!gate.allowed) {
              ws.send(JSON.stringify({ type: 'session_limit_reached', count: gate.count, limit: FREE_SESSION_LIMIT }));
              return;
            }
            if (gate.byok) {
              const settings = await getUserSettings(session.userId);
              const apiKey = decrypt(settings.anthropic_api_key_encrypted);
              session.anthropicClient = new Anthropic({ apiKey, maxRetries: 5 });
            }
          }
          session.active = true;
          session.mode = 'guided';

          // Create conversation in DB
          if (session.userId) {
            const convId = await createConversation(session.userId, msg.problemText);
            session.conversationId = convId;
            if (convId) {
              ws.send(JSON.stringify({ type: 'conversation_created', conversationId: convId }));
            }
          }

          try {
            await startGuidedSession(session, msg.problemText, msg.imageBase64, msg.imageMimeType);
          } catch (err) {
            if (err.message === '__end_session__') {
              console.log('[GuidedAgent] Session ended by user');
            } else {
              console.error('[GuidedAgent] Error:', err);
              ws.send(JSON.stringify({ type: 'error', message: 'Guided session failed: ' + err.message }));
            }
          }
          if (session.runGeneration === guidedGen) {
            session.active = false;
            session.endSessionFlag = false;
            session.mode = 'direct';
            session.followUpResolver = null;
            session.followUpSent = false;
            session.conversationId = null;
            ws.send(JSON.stringify({ type: 'session_ended' }));
          }
          break;
        }

        case 'guided_response': {
          if (!session.active) return;
          session.guidedResponse = { optionId: msg.optionId, optionIds: msg.optionIds, labels: msg.labels, text: msg.text, timestamp: Date.now() };
          if (session.guidedResponseResolver) {
            session.guidedResponseResolver();
            session.guidedResponseResolver = null;
          }
          // Auto-resume if paused so the response gets processed immediately
          if (session.pauseResolver) {
            session.pauseResolver();
            session.pauseResolver = null;
          }
          break;
        }

        case 'guided_message': {
          if (!session.active) return;
          session.guidedMessageQueue.push(msg.text);
          // If the agent is waiting for a response (send_options), resolve it with the freeform text
          if (session.guidedResponseResolver) {
            session.guidedResponse = { text: msg.text, timestamp: Date.now() };
            session.guidedResponseResolver();
            session.guidedResponseResolver = null;
          } else if (session.followUpResolver) {
            // Follow-up question after lesson completion — pull from queue to avoid double-injection
            session.guidedMessageQueue.pop();
            session.followUpResolver(msg.text);
            session.followUpResolver = null;
          }
          // If paused, auto-resume so the student message gets processed immediately
          if (session.pauseResolver) {
            session.pauseResolver();
            session.pauseResolver = null;
          }
          break;
        }

        case 'interrupt': {
          if (!session.active) return;
          session.interruptFlag = {
            question: msg.question,
            timestamp: Date.now(),
          };
          console.log(`[WS] Interrupt queued: "${msg.question}"`);
          // Unblock guided response promise if waiting
          if (session.guidedResponseResolver) {
            session.guidedResponseResolver('__interrupted__');
            session.guidedResponseResolver = null;
          }
          break;
        }

        case 'end_session': {
          if (!session.active) return;
          console.log(`[WS] End session requested`);
          session.endSessionFlag = true;
          session.pauseFlag = true; // unblock TTS waits
          // Unblock any pause wait
          if (session.pauseResolver) {
            session.pauseResolver();
            session.pauseResolver = null;
          }
          // Unblock guided response wait
          if (session.guidedResponseResolver) {
            session.guidedResponseResolver('__end_session__');
            session.guidedResponseResolver = null;
          }
          // Unblock follow-up wait
          if (session.followUpResolver) {
            session.followUpResolver('__end_session__');
            session.followUpResolver = null;
          }
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

        case 'set_tts_muted': {
          session.ttsMuted = !!msg.muted;
          console.log(`[WS] TTS muted: ${session.ttsMuted}`);
          break;
        }

        case 'list_conversations': {
          if (!session.userId) {
            ws.send(JSON.stringify({ type: 'conversations_list', conversations: [] }));
            return;
          }
          const conversations = await listConversations(session.userId);
          ws.send(JSON.stringify({ type: 'conversations_list', conversations }));
          break;
        }

        case 'load_conversation': {
          const messages = await loadConversationMessages(msg.conversationId);
          ws.send(JSON.stringify({ type: 'conversation_loaded', messages }));
          break;
        }

        case 'resume_conversation': {
          if (session.active && !session.endSessionFlag) {
            ws.send(JSON.stringify({ type: 'error', message: 'Session already in progress' }));
            return;
          }
          session.active = false;
          session.endSessionFlag = false;
          session.runGeneration++;
          const resumeGen = session.runGeneration;
          {
            const gate = await checkSessionGate(session);
            if (!gate.allowed) {
              ws.send(JSON.stringify({ type: 'session_limit_reached', count: gate.count, limit: FREE_SESSION_LIMIT }));
              return;
            }
            if (gate.byok) {
              const settings = await getUserSettings(session.userId);
              const apiKey = decrypt(settings.anthropic_api_key_encrypted);
              session.anthropicClient = new Anthropic({ apiKey, maxRetries: 5 });
            }
          }

          const agentState = await loadAgentState(msg.conversationId);
          if (!agentState) {
            ws.send(JSON.stringify({ type: 'error', message: 'No saved agent state for this conversation' }));
            return;
          }

          // Send transcript to client for display
          const transcript = await loadConversationMessages(msg.conversationId);
          ws.send(JSON.stringify({ type: 'conversation_loaded', messages: transcript }));

          session.active = true;
          session.mode = 'guided';
          session.conversationId = msg.conversationId;

          try {
            await resumeGuidedSession(session, agentState.messages_json, agentState.solver_result_json, agentState.viz_state_json);
          } catch (err) {
            if (err.message === '__end_session__') {
              console.log('[GuidedAgent] Resumed session ended by user');
            } else {
              console.error('[GuidedAgent] Resume error:', err);
              ws.send(JSON.stringify({ type: 'error', message: 'Resume failed: ' + err.message }));
            }
          }
          if (session.runGeneration === resumeGen) {
            session.active = false;
            session.endSessionFlag = false;
            session.mode = 'direct';
            session.followUpResolver = null;
            session.followUpSent = false;
            session.conversationId = null;
            ws.send(JSON.stringify({ type: 'session_ended' }));
          }
          break;
        }

        case 'save_api_key': {
          if (!session.userId) {
            ws.send(JSON.stringify({ type: 'api_key_result', success: false, error: 'Not authenticated' }));
            return;
          }
          const key = msg.apiKey?.trim();
          if (!key || !key.startsWith('sk-ant-')) {
            ws.send(JSON.stringify({ type: 'api_key_result', success: false, error: 'Invalid API key format. Key should start with sk-ant-' }));
            return;
          }
          // Test the key with a cheap API call
          try {
            const testClient = new Anthropic({ apiKey: key });
            await testClient.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'hi' }],
            });
          } catch (err) {
            console.error('[WS] API key validation failed:', err.message);
            ws.send(JSON.stringify({ type: 'api_key_result', success: false, error: 'API key validation failed. Please check your key.' }));
            return;
          }
          // Encrypt and store
          const encrypted = encrypt(key);
          await saveUserSettings(session.userId, { anthropic_api_key_encrypted: encrypted });
          ws.send(JSON.stringify({ type: 'api_key_result', success: true }));
          break;
        }

        case 'register_interest': {
          if (!session.userId) return;
          await saveUserSettings(session.userId, {
            would_pay: true,
            would_pay_amount: msg.amount || null,
            other_classes: msg.otherClasses || null,
            comments: msg.comments || null,
          });
          ws.send(JSON.stringify({ type: 'interest_registered' }));
          break;
        }

        case 'check_session_status': {
          if (!session.userId) {
            ws.send(JSON.stringify({ type: 'session_status', allowed: true }));
            return;
          }
          const count = await countConversations(session.userId);
          const settings = await getUserSettings(session.userId);
          const hasByok = !!settings?.anthropic_api_key_encrypted;
          const allowed = count < FREE_SESSION_LIMIT || hasByok;
          ws.send(JSON.stringify({
            type: 'session_status',
            allowed,
            count,
            limit: FREE_SESSION_LIMIT,
            hasByok,
          }));
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
    // Resolve followUpResolver so startGuidedSession can return cleanly
    if (session.followUpResolver) {
      session.followUpResolver('__timeout__');
      session.followUpResolver = null;
    }
    sessions.delete(sessionId);
  });
});

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`[Server] Argmax running on http://localhost:${PORT}`);
  if (authEnabled) {
    console.log(`[Server] Auth enabled (Supabase)`);
  } else {
    console.log(`[Server] Auth disabled (no Supabase credentials)`);
  }
});
