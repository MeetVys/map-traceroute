import { memo } from "react";
import type { GeoRef } from "./types";
import { type PacketState, protoColor } from "./Map";

const FADE_MS = 500;

type Props = {
  packet: PacketState;
  now: number;
};

function fmtLocation(g: GeoRef): string {
  if (g.local) return "(local)";
  if (!g.city && !g.country) return "Unknown";
  return [g.city, g.country].filter(Boolean).join(", ");
}

function dirGlyph(direction: "in" | "out"): { sym: string; color: string } {
  return direction === "out"
    ? { sym: "↑ out", color: "#50c8ff" }
    : { sym: "↓ in", color: "#ffa050" };
}

function opacityFor(p: PacketState, now: number): number {
  if (p.expiredAt === undefined) return 1;
  const t = (now - p.expiredAt) / FADE_MS;
  return Math.max(0, 1 - t);
}

function PacketRowInner({ packet, now }: Props) {
  const age = ((now - packet.addedAt) / 1000).toFixed(1);
  const glyph = dirGlyph(packet.direction);
  const opacity = opacityFor(packet, now);

  return (
    <tr style={{ opacity, transition: "opacity 0.1s linear" }}>
      <td style={{ color: glyph.color, padding: "4px 8px", whiteSpace: "nowrap" }}>
        {glyph.sym}
      </td>
      <td style={{ padding: "4px 8px", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
        <div>{packet.src.ip}</div>
        <div style={{ opacity: 0.6, fontSize: 11 }}>{fmtLocation(packet.src)}</div>
      </td>
      <td style={{ padding: "4px 8px", fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
        <div>{packet.dst.ip}</div>
        <div style={{ opacity: 0.6, fontSize: 11 }}>{fmtLocation(packet.dst)}</div>
      </td>
      <td style={{ padding: "4px 8px", opacity: 0.9 }}>
        <span
          data-testid="proto-dot"
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            marginRight: 6,
            background: `rgb(${protoColor(packet.proto).join(",")})`,
            verticalAlign: "middle",
          }}
        />
        {packet.proto}
      </td>
      <td style={{ padding: "4px 8px", opacity: 0.8, textAlign: "right" }}>{packet.length}</td>
      <td style={{ padding: "4px 8px", opacity: 0.8, textAlign: "right" }}>{age}s</td>
    </tr>
  );
}

export const PacketRow = memo(PacketRowInner, (prev, next) => {
  if (prev.packet.id !== next.packet.id) return false;
  if (prev.packet.expiredAt !== next.packet.expiredAt) return false;
  const prevBucket = Math.floor((prev.now - prev.packet.addedAt) / 250);
  const nextBucket = Math.floor((next.now - next.packet.addedAt) / 250);
  return prevBucket === nextBucket;
});
