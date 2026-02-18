import { useRef, useEffect, useCallback, useState } from 'react';

export function useWebSocket(onMessage, onBinary) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef(null);
  const onMessageRef = useRef(onMessage);
  const onBinaryRef = useRef(onBinary);

  // Keep refs current without triggering reconnects
  onMessageRef.current = onMessage;
  onBinaryRef.current = onBinary;

  useEffect(() => {
    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

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
        reconnectTimer.current = setTimeout(connect, 2000);
      };

      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
      };
    }

    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((msg) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  return { send, connected };
}
