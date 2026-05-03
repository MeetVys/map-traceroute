import { useEffect, useMemo, useState } from "react";
import type { PacketState } from "./Map";
import { PacketRow } from "./PacketRow";

const MAX_ROWS = 200;

type Props = {
  packets: Map<string, PacketState>;
};

export function PacketList({ packets }: Props) {
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(id);
  }, []);

  const sorted = useMemo(() => {
    const arr = Array.from(packets.values());
    arr.sort((a, b) => b.ts - a.ts);
    return arr;
  }, [packets, now]);

  const visible = sorted.slice(0, MAX_ROWS);
  const hidden = Math.max(0, sorted.length - MAX_ROWS);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 240,
        background: "rgba(8, 12, 24, 0.9)",
        color: "#eee",
        fontFamily: "system-ui, sans-serif",
        zIndex: 20,
        borderTop: "1px solid #2a3048",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "8px 14px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 13,
          borderBottom: "1px solid #2a3048",
        }}
      >
        <span>Live packets (last 5s)</span>
        <span style={{ opacity: 0.7 }} data-testid="packet-count">
          {sorted.length} active
        </span>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead
            style={{
              position: "sticky",
              top: 0,
              background: "#11182a",
              opacity: 0.95,
            }}
          >
            <tr style={{ textAlign: "left", opacity: 0.7 }}>
              <th style={{ padding: "6px 8px" }}>dir</th>
              <th style={{ padding: "6px 8px" }}>source</th>
              <th style={{ padding: "6px 8px" }}>destination</th>
              <th style={{ padding: "6px 8px" }}>proto</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>bytes</th>
              <th style={{ padding: "6px 8px", textAlign: "right" }}>age</th>
            </tr>
          </thead>
          <tbody data-testid="packet-list-body">
            {visible.map((p) => (
              <PacketRow key={p.id} packet={p} now={now} />
            ))}
          </tbody>
        </table>
        {hidden > 0 && (
          <div
            style={{ padding: "6px 14px", fontSize: 12, opacity: 0.6 }}
            data-testid="overflow-footer"
          >
            + {hidden} more hidden
          </div>
        )}
      </div>
    </div>
  );
}
