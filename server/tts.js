// ElevenLabs TTS streaming

import WebSocket from 'ws';

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';

/**
 * Convert math/CS notation into speakable English for TTS.
 * ElevenLabs cannot handle symbols like dp[i][w], O(n log n), ≤, →, ∞, etc.
 * This runs before sending text to the API; the UI still shows original text.
 */
/**
 * Convert a single LaTeX math fragment (already stripped of $..$ delimiters)
 * into speakable English.
 */
function latexToSpeech(latex) {
  let t = latex;

  // \text{...} → plain text
  t = t.replace(/\\text\{([^}]*)\}/g, '$1');

  // \frac{a}{b} → "a over b"
  t = t.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1 over $2');

  // \sqrt{x} → "square root of x"
  t = t.replace(/\\sqrt\{([^}]*)\}/g, 'square root of $1');

  // Named operators / Greek letters → English words
  const symbols = [
    [/\\sum/g, 'sum'],
    [/\\prod/g, 'product'],
    [/\\int/g, 'integral'],
    [/\\min/g, 'min'],
    [/\\max/g, 'max'],
    [/\\log/g, 'log'],
    [/\\ln/g, 'ln'],
    [/\\inf/g, 'infimum'],
    [/\\sup/g, 'supremum'],
    [/\\lim/g, 'limit'],
    [/\\forall/g, 'for all'],
    [/\\exists/g, 'there exists'],
    [/\\in/g, ' in '],
    [/\\notin/g, ' not in '],
    [/\\subset/g, ' subset of '],
    [/\\subseteq/g, ' subset of '],
    [/\\cup/g, ' union '],
    [/\\cap/g, ' intersect '],
    [/\\emptyset/g, 'empty set'],
    [/\\neg/g, 'not '],
    [/\\land/g, ' and '],
    [/\\lor/g, ' or '],
    [/\\Sigma/g, 'sigma'],
    [/\\sigma/g, 'sigma'],
    [/\\Pi/g, 'pi'],
    [/\\pi/g, 'pi'],
    [/\\alpha/g, 'alpha'],
    [/\\beta/g, 'beta'],
    [/\\gamma/g, 'gamma'],
    [/\\delta/g, 'delta'],
    [/\\epsilon/g, 'epsilon'],
    [/\\lambda/g, 'lambda'],
    [/\\mu/g, 'mu'],
    [/\\theta/g, 'theta'],
    [/\\phi/g, 'phi'],
    [/\\infty/g, 'infinity'],
    [/\\cdot/g, ' times '],
    [/\\times/g, ' times '],
    [/\\div/g, ' divided by '],
    [/\\pm/g, ' plus or minus '],
    [/\\leq/g, ' less than or equal to '],
    [/\\geq/g, ' greater than or equal to '],
    [/\\neq/g, ' not equal to '],
    [/\\le/g, ' less than or equal to '],
    [/\\ge/g, ' greater than or equal to '],
    [/\\ne/g, ' not equal to '],
    [/\\lt/g, ' less than '],
    [/\\gt/g, ' greater than '],
    [/\\approx/g, ' approximately '],
    [/\\equiv/g, ' is equivalent to '],
    [/\\rightarrow/g, ' to '],
    [/\\leftarrow/g, ' from '],
    [/\\leftrightarrow/g, ' between '],
    [/\\Rightarrow/g, ' implies '],
    [/\\Leftarrow/g, ' is implied by '],
    [/\\iff/g, ' if and only if '],
    [/\\star/g, ' star '],
    [/\\ast/g, ' star '],
  ];
  for (const [pat, rep] of symbols) {
    t = t.replace(pat, rep);
  }

  // Superscripts: x^{2} → "x to the power of 2", x^2 → "x squared"
  t = t.replace(/\^{\\prime}/g, ' prime');
  t = t.replace(/\^\{([^}]*)\}/g, ' to the power of $1');
  t = t.replace(/\^(\w)/g, (_, c) => {
    if (c === '2') return ' squared';
    if (c === '3') return ' cubed';
    return ` to the power of ${c}`;
  });

  // Subscripts: x_{uv} → "x sub u v", x_i → "x sub i"
  t = t.replace(/_\{([^}]*)\}/g, ' sub $1');
  t = t.replace(/_(\w)/g, ' sub $1');

  // Strip remaining braces and backslashes
  t = t.replace(/[{}]/g, '');
  t = t.replace(/\\/g, ' ');

  return t.replace(/\s+/g, ' ').trim();
}

export function normalizeTTSText(text) {
  let t = text;

  // Process LaTeX math regions: $...$ → speakable English
  // Handle both $$...$$ (display) and $...$ (inline)
  t = t.replace(/\$\$([^$]+)\$\$/g, (_, inner) => latexToSpeech(inner));
  t = t.replace(/\$([^$]+)\$/g, (_, inner) => latexToSpeech(inner));

  // Big-O notation: O(n log n) → "O of n log n"
  t = t.replace(/O\(([^)]+)\)/g, 'O of $1');

  // Double subscript: dp[i][w] → "dp of i, w"
  t = t.replace(/(\w+)\[([^\]]+)\]\[([^\]]+)\]/g, '$1 of $2, $3');
  // Single subscript: arr[0] → "arr of 0"
  t = t.replace(/(\w+)\[([^\]]+)\]/g, '$1 of $2');

  // Unicode superscripts: handle all digits, not just ² and ³
  // Multi-digit superscripts first (e.g. 3¹² → "3 to the power of 12")
  t = t.replace(/(\w)[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (match) => {
    const base = match[0];
    const supMap = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
    const exp = [...match].slice(1).map(c => supMap[c] || c).join('');
    if (exp === '2') return `${base} squared`;
    if (exp === '3') return `${base} cubed`;
    return `${base} to the power of ${exp}`;
  });

  // Unicode subscript digits/letters (e.g. x₀, Mf with subscript f)
  t = t.replace(/[₀₁₂₃₄₅₆₇₈₉ₐₑₒₓₕₖₗₘₙₚₛₜ]+/g, (match) => {
    const subMap = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₕ': 'h', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₚ': 'p', 'ₛ': 's', 'ₜ': 't' };
    const sub = [...match].map(c => subMap[c] || c).join('');
    return ` sub ${sub}`;
  });

  // Greek letters (Unicode, outside of LaTeX)
  t = t.replace(/ω/g, 'omega');
  t = t.replace(/Ω/g, 'omega');
  t = t.replace(/α/g, 'alpha');
  t = t.replace(/β/g, 'beta');
  t = t.replace(/γ/g, 'gamma');
  t = t.replace(/δ/g, 'delta');
  t = t.replace(/ε/g, 'epsilon');
  t = t.replace(/λ/g, 'lambda');
  t = t.replace(/μ/g, 'mu');
  t = t.replace(/θ/g, 'theta');
  t = t.replace(/φ/g, 'phi');
  t = t.replace(/σ/g, 'sigma');
  t = t.replace(/Σ/g, 'sigma');
  t = t.replace(/π/g, 'pi');
  t = t.replace(/Π/g, 'pi');
  t = t.replace(/τ/g, 'tau');

  // Congruence / equivalence
  t = t.replace(/≡/g, ' is congruent to ');

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
