import type { CSSProperties } from "react";
import { ThemePicker } from "./ThemePicker";
import { useTheme } from "./theme";

type Props = {
  capturing: boolean;
  packetCount: number;
  onStart: () => void;
  onStop: () => void;
};

function btn(disabled: boolean, accent: string): CSSProperties {
  return {
    background: disabled ? "var(--panel-border)" : accent,
    color: "#fff",
    border: "none",
    padding: "6px 14px",
    borderRadius: 4,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
    fontSize: 13,
  };
}

export function Controls({ capturing, packetCount, onStart, onStop }: Props) {
  const theme = useTheme();
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 10,
        background: "var(--panel)",
        padding: "10px 14px",
        borderRadius: 6,
        color: "var(--text)",
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
        border: "1px solid var(--panel-border)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 260,
      }}
    >
      <ThemePicker />
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onStart} disabled={capturing} style={btn(capturing, theme.accent)}>
          Start
        </button>
        <button onClick={onStop} disabled={!capturing} style={btn(!capturing, theme.accent)}>
          Stop
        </button>
        <span>{capturing ? "● capturing" : "○ stopped"}</span>
        <span style={{ color: "var(--text-muted)", marginLeft: "auto" }}>
          packets: {packetCount}
        </span>
      </div>
    </div>
  );
}
