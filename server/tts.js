// ElevenLabs TTS streaming

import WebSocket from 'ws';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';

/**
 * Convert math/CS notation into speakable English for TTS.
 * ElevenLabs cannot handle symbols like dp[i][w], O(n log n), ≤, →, ∞, etc.
 * This runs before sending text to the API; the UI still shows original text.
 */
export function normalizeTTSText(text) {
  let t = text;

  // Big-O notation: O(n log n) → "O of n log n"
  t = t.replace(/O\(([^)]+)\)/g, 'O of $1');

  // Double subscript: dp[i][w] → "dp of i, w"
  t = t.replace(/(\w+)\[([^\]]+)\]\[([^\]]+)\]/g, '$1 of $2, $3');
  // Single subscript: arr[0] → "arr of 0"
  t = t.replace(/(\w+)\[([^\]]+)\]/g, '$1 of $2');

  // Superscripts
  t = t.replace(/(\w)²/g, '$1 squared');
  t = t.replace(/(\w)³/g, '$1 cubed');

  // Unicode math symbols
  t = t.replace(/∞/g, 'infinity');
  t = t.replace(/↔/g, ' between ');
  t = t.replace(/→/g, ' to ');
  t = t.replace(/←/g, ' from ');

  // ASCII arrows: A->B, A<-B, A<->B (must come before comparison operators)
  t = t.replace(/<->/g, ' between ');
  t = t.replace(/->/g, ' to ');
  t = t.replace(/<-/g, ' from ');
  t = t.replace(/≤/g, ' less than or equal to ');
  t = t.replace(/≥/g, ' greater than or equal to ');
  t = t.replace(/≠/g, ' not equal to ');

  // Equality operators: == → "equals"
  t = t.replace(/==/g, ' equals ');
  // Single = when followed by a value (assignment/equality in narration)
  t = t.replace(/(?<!=)=(?!=)/g, ' equals ');

  // Absolute value: |x| → "absolute value of x"
  t = t.replace(/\|([^|]+)\|/g, 'absolute value of $1');

  // Flow notation: "3/10" → "3 out of 10"
  t = t.replace(/(\d+)\/(\d+)/g, '$1 out of $2');

  // Set braces: {A, B} → "the set A, B"
  t = t.replace(/\{([^}]+)\}/g, 'the set $1');

  // Ellipsis → pause
  t = t.replace(/\.\.\./g, ', and so on,');

  // Clean up extra spaces
  t = t.replace(/\s+/g, ' ').trim();

  return t;
}

/**
 * Synthesize text to speech and stream audio to the client.
 * `sendBinaryFn(buffer)` is called for each audio chunk.
 * `sendJsonFn(obj)` is called to send JSON messages (audio_start/audio_end).
 * Falls back to simulated delay if no ElevenLabs key.
 */
export async function synthesizeAndStream(sendBinaryFn, text, speedMultiplier = 1, sendJsonFn = null) {
  if (!ELEVENLABS_API_KEY) {
    console.log('[TTS] No ElevenLabs API key configured, using simulated delay');
    const wordCount = normalizeTTSText(text).split(/\s+/).length;
    const delayMs = (wordCount * 200) / speedMultiplier;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return;
  }

  console.log('[TTS] API key length:', ELEVENLABS_API_KEY.length, '| Voice ID:', VOICE_ID);

  const wsUrl = `wss://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream-input?model_id=eleven_turbo_v2_5&output_format=pcm_24000`;

  const streamStartTime = Date.now();

  return new Promise((resolve) => {
    let receivedAudio = false;
    let totalAudioBytes = 0;
    let timeoutId = null;

    const elWs = new WebSocket(wsUrl);

    // Timeout: if no audio within 10s, warn and resolve
    timeoutId = setTimeout(() => {
      if (!receivedAudio) {
        console.warn('[TTS] No audio received within 10s, resolving (voice ID:', VOICE_ID, ')');
        try { elWs.close(); } catch (_) {}
        resolve();
      }
    }, 10000);

    elWs.on('open', () => {
      console.log('[TTS] ElevenLabs WS connected');
      elWs.send(
        JSON.stringify({
          text: ' ',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
          generation_config: {
            speed: speedMultiplier,
          },
          xi_api_key: ELEVENLABS_API_KEY,
        })
      );
      elWs.send(JSON.stringify({ text: normalizeTTSText(text) + ' ' }));
      elWs.send(JSON.stringify({ text: '' }));
    });

    elWs.on('message', (data) => {
      try {
        const raw = data.toString();
        const msg = JSON.parse(raw);
        if (!msg.audio) {
          console.log('[TTS] Non-audio message:', raw.slice(0, 200));
        }
        if (msg.audio) {
          if (!receivedAudio) {
            receivedAudio = true;
            console.log('[TTS] First audio chunk received');
            if (sendJsonFn) {
              sendJsonFn({ type: 'audio_start' });
            }
          }
          const audioBuffer = Buffer.from(msg.audio, 'base64');
          totalAudioBytes += audioBuffer.length;
          sendBinaryFn(audioBuffer);
        }
        if (msg.isFinal) {
          console.log('[TTS] Stream complete (isFinal received)');
          elWs.close();
        }
      } catch (err) {
        console.error('[TTS] Error parsing message:', err.message);
      }
    });

    elWs.on('close', (code, reason) => {
      clearTimeout(timeoutId);
      // PCM 24000 Hz, 16-bit mono = 2 bytes per sample
      const audioDurationMs = (totalAudioBytes / (24000 * 2)) * 1000;
      const elapsedMs = Date.now() - streamStartTime;
      const remainingMs = Math.max(0, audioDurationMs - elapsedMs);
      console.log('[TTS] ElevenLabs WS closed, code:', code, 'reason:', reason?.toString() || '(none)');
      console.log(`[TTS] Audio duration: ${Math.round(audioDurationMs)}ms, elapsed: ${Math.round(elapsedMs)}ms, waiting: ${Math.round(remainingMs)}ms`);
      if (sendJsonFn && receivedAudio) {
        sendJsonFn({ type: 'audio_end' });
      }
      // Wait for client to finish playing queued audio
      setTimeout(() => resolve(audioDurationMs), remainingMs);
    });

    elWs.on('error', (err) => {
      clearTimeout(timeoutId);
      console.error('[TTS] ElevenLabs WS error:', err.message);
      try { elWs.close(); } catch (_) {}
      resolve();
    });
  });
}
