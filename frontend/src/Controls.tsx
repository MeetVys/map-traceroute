import type { CSSProperties } from "react";

type Props = {
  capturing: boolean;
  packetCount: number;
  onStart: () => void;
  onStop: () => void;
};

const btn = (disabled: boolean): CSSProperties => ({
  background: disabled ? "#2a2f45" : "#3b82f6",
  color: "#fff",
  border: "none",
  padding: "6px 14px",
  borderRadius: 4,
  cursor: disabled ? "default" : "pointer",
  opacity: disabled ? 0.6 : 1,
});

export function Controls({ capturing, packetCount, onStart, onStop }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 10,
        background: "rgba(10,15,30,0.7)",
        padding: "10px 14px",
        borderRadius: 6,
        color: "#eee",
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
      }}
    >
      <button onClick={onStart} disabled={capturing} style={btn(capturing)}>
        Start
      </button>
      <button
        onClick={onStop}
        disabled={!capturing}
        style={{ ...btn(!capturing), marginLeft: 8 }}
      >
        Stop
      </button>
      <span style={{ marginLeft: 14 }}>
        {capturing ? "● capturing" : "○ stopped"}
      </span>
      <span style={{ marginLeft: 14, opacity: 0.7 }}>packets: {packetCount}</span>
    </div>
  );
}
