import { useEffect, useRef, useState } from "react";
import { Controls } from "./Controls";
import { MapView, type PacketState } from "./Map";
import { WSClient } from "./ws";
import type { PacketDTO, ServerMsg } from "./types";

const FADE_MS = 500;

function wsUrl(): string {
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

export function App() {
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [, setRenderTick] = useState(0);
  const packetsRef = useRef<Map<string, PacketState>>(new Map());
  const wsRef = useRef<WSClient | null>(null);

  useEffect(() => {
    const ws = new WSClient(wsUrl());
    wsRef.current = ws;
    ws.onMessage((m: ServerMsg) => {
      if (m.type === "status") {
        setCapturing(m.data.capturing);
      } else if (m.type === "packet") {
        addPacket(packetsRef.current, m.data);
        setRenderTick((t) => t + 1);
      } else if (m.type === "expire") {
        expirePacket(packetsRef.current, m.data.id);
        setRenderTick((t) => t + 1);
      } else if (m.type === "snapshot") {
        const now = performance.now();
        packetsRef.current.clear();
        for (const p of m.data) {
          packetsRef.current.set(p.id, { ...p, addedAt: now });
        }
        setRenderTick((t) => t + 1);
      } else if (m.type === "error") {
        setError(m.data.message);
      }
    });
    ws.connect();

    const gc = setInterval(() => {
      const now = performance.now();
      let changed = false;
      for (const [id, p] of packetsRef.current) {
        if (p.expiredAt !== undefined && now - p.expiredAt > FADE_MS) {
          packetsRef.current.delete(id);
          changed = true;
        }
      }
      if (changed) setRenderTick((t) => t + 1);
    }, 200);

    return () => {
      clearInterval(gc);
      ws.close();
    };
  }, []);

  const onStart = () => wsRef.current?.send({ type: "start" });
  const onStop = () => wsRef.current?.send({ type: "stop" });

  return (
    <>
      <MapView packets={packetsRef.current} />
      <Controls
        capturing={capturing}
        packetCount={packetsRef.current.size}
        onStart={onStart}
        onStop={onStop}
      />
      {error && (
        <div
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            background: "#4a1020",
            color: "#fdd",
            padding: "8px 12px",
            borderRadius: 4,
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}
    </>
  );
}

function addPacket(map: Map<string, PacketState>, p: PacketDTO): void {
  map.set(p.id, { ...p, addedAt: performance.now() });
}

function expirePacket(map: Map<string, PacketState>, id: string): void {
  const existing = map.get(id);
  if (!existing) return;
  map.set(id, { ...existing, expiredAt: performance.now() });
}
