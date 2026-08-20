"use client";

import { useEffect, useRef, useState } from "react";
import { WS_BASE_URL } from "@/services/config";

export type ConnectionState = "connecting" | "open" | "closed" | "error";

/**
 * Subscribes to one /ws/live/* channel and invokes onMessage for every
 * parsed JSON payload. Reconnects with backoff on drop — the backend relay
 * has no memory of missed messages, so a dropped connection just means a
 * gap in the live feed, not a fatal error the UI needs to surface loudly.
 */
export function useLiveChannel<T>(channel: string, onMessage: (data: T) => void) {
  const [state, setState] = useState<ConnectionState>("connecting");
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    let attempt = 0;

    function connect() {
      if (cancelled) return;
      setState("connecting");
      socket = new WebSocket(`${WS_BASE_URL}/${channel}`);

      socket.onopen = () => {
        attempt = 0;
        setState("open");
      };

      socket.onmessage = (event) => {
        try {
          onMessageRef.current(JSON.parse(event.data));
        } catch {
          // Malformed payload from the relay — drop it, don't crash the UI.
        }
      };

      socket.onerror = () => setState("error");

      socket.onclose = () => {
        if (cancelled) return;
        setState("closed");
        attempt += 1;
        const delay = Math.min(1000 * 2 ** attempt, 15000);
        reconnectTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [channel]);

  return state;
}
