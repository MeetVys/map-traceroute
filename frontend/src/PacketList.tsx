import { useEffect, useMemo, useState } from "react";
import type { PacketState } from "./Map";
import { PacketRow } from "./PacketRow";
import { useTheme } from "./theme";

const MAX_ROWS = 200;

type Props = {
  packets: Map<string, PacketState>;
};

export function PacketList({ packets }: Props) {
  const theme = useTheme();
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
        background: "var(--panel)",
        color: "var(--text)",
        fontFamily: "system-ui, sans-serif",
        zIndex: 20,
        borderTop: "1px solid var(--panel-border)",
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
          borderBottom: "1px solid var(--panel-border)",
        }}
      >
        <span>Live packets (last 5s)</span>
        <span style={{ color: "var(--text-muted)" }} data-testid="packet-count">
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
              background: "var(--panel)",
              borderBottom: "1px solid var(--panel-border)",
            }}
          >
            <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
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
              <PacketRow key={p.id} packet={p} now={now} theme={theme} />
            ))}
          </tbody>
        </table>
        {hidden > 0 && (
          <div
            style={{ padding: "6px 14px", fontSize: 12, color: "var(--text-muted)" }}
            data-testid="overflow-footer"
          >
            + {hidden} more hidden
          </div>
        )}
      </div>
    </div>
  );
}
