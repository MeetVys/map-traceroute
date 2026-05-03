import { describe, it, expect } from "vitest";
import {
  lerp,
  colorWithAlpha,
  protoColor,
  FADE_WINDOW_MS,
  PROTO_COLORS,
  OUT_HEIGHT,
  IN_HEIGHT,
} from "./Map";
import type { PacketState } from "./Map";

function packet(overrides: Partial<PacketState> = {}): PacketState {
  return {
    id: "x",
    ts: 0,
    direction: "out",
    proto: "tcp",
    length: 100,
    src: { ip: "1.1.1.1", lat: 0, lng: 0, local: false },
    dst: { ip: "8.8.8.8", lat: 10, lng: 10, local: false },
    addedAt: 0,
    ...overrides,
  };
}

describe("lerp", () => {
  it("midpoint", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
  it("endpoints", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });
});

describe("protoColor", () => {
  it("tcp", () => expect(protoColor("tcp")).toEqual(PROTO_COLORS.tcp));
  it("udp", () => expect(protoColor("udp")).toEqual(PROTO_COLORS.udp));
  it("icmp", () => expect(protoColor("icmp")).toEqual(PROTO_COLORS.icmp));
  it("other", () => expect(protoColor("other")).toEqual(PROTO_COLORS.other));
  it("unknown proto falls back to other", () =>
    expect(protoColor("gre")).toEqual(PROTO_COLORS.other));
});

describe("colorWithAlpha", () => {
  it("full alpha, color comes from proto (tcp)", () => {
    const c = colorWithAlpha(packet({ proto: "tcp" }), 100);
    expect(c.slice(0, 3)).toEqual(PROTO_COLORS.tcp);
    expect(c[3]).toBe(255);
  });

  it("udp color independent of direction", () => {
    const out = colorWithAlpha(packet({ proto: "udp", direction: "out" }), 100);
    const inc = colorWithAlpha(packet({ proto: "udp", direction: "in" }), 100);
    expect(out.slice(0, 3)).toEqual(PROTO_COLORS.udp);
    expect(inc.slice(0, 3)).toEqual(PROTO_COLORS.udp);
  });

  it("mid-fade alpha ≈ 128", () => {
    const now = 1000;
    const c = colorWithAlpha(packet({ expiredAt: now - FADE_WINDOW_MS / 2 }), now);
    expect(c[3]).toBeGreaterThan(120);
    expect(c[3]).toBeLessThan(135);
  });

  it("past fade = 0 alpha", () => {
    const now = 1000;
    const c = colorWithAlpha(packet({ expiredAt: now - FADE_WINDOW_MS - 100 }), now);
    expect(c[3]).toBe(0);
  });
});

describe("heights", () => {
  it("out > in", () => {
    expect(OUT_HEIGHT).toBeGreaterThan(IN_HEIGHT);
  });
});
