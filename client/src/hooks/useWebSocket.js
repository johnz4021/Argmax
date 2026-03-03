import { useRef, useEffect, useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useWebSocket(onMessage, onBinary, enabled = true) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef(null);
  const onMessageRef = useRef(onMessage);
  const onBinaryRef = useRef(onBinary);

  // Keep refs current without triggering reconnects
  onMessageRef.current = onMessage;
  onBinaryRef.current = onBinary;

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;

    async function connect() {
      if (disposed) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let wsUrl = `${protocol}//${window.location.host}/ws`;

      // Attach auth token if Supabase is configured
      if (supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            wsUrl += `?token=${session.access_token}`;
          } else {
            // No session — don't attempt connection, retry later
            reconnectTimer.current = setTimeout(connect, 2000);
            return;
          }
        } catch (err) {
          console.error('[WS] Failed to get auth token:', err);
          reconnectTimer.current = setTimeout(connect, 2000);
          return;
        }
      }

      if (disposed) return;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        console.log('[WS] Connected');
        setConnected(true);
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          onBinaryRef.current?.(event.data);
        } else {
          try {
            const msg = JSON.parse(event.data);
            onMessageRef.current?.(msg);
          } catch (err) {
            console.error('[WS] Parse error:', err);
          }
        }
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected');
        setConnected(false);
        wsRef.current = null;
        if (!disposed) {
          reconnectTimer.current = setTimeout(connect, 2000);
        }
      };

      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
      };
    }

    connect();
    return () => {
      disposed = true;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [enabled]);

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { send, connected };
}
