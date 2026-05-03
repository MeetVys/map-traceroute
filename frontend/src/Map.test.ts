import { describe, it, expect } from "vitest";
import {
  lerp,
  colorWithAlpha,
  protoColor,
  FADE_WINDOW_MS,
  PROTO_COLORS,
  OUT_HEIGHT,
  IN_HEIGHT,
  PARTICLE_PERIOD,
  particleProgress,
  arcPoint,
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

describe("gradient fallback cue", () => {
  it("source end is dimmer than target end", () => {
    const p = packet({ proto: "tcp" });
    const src = colorWithAlpha(p, 0, 0.6);
    const dst = colorWithAlpha(p, 0);
    expect(src[0]).toBeLessThan(dst[0]);
    expect(src[1]).toBeLessThan(dst[1]);
    expect(src[2]).toBeLessThan(dst[2]);
  });
});

describe("particleProgress", () => {
  it("stays in [0, 1)", () => {
    for (let dt = 0; dt < 5000; dt += 73) {
      const t = particleProgress(0, dt);
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThan(1);
    }
  });

  it("is 0 at addedAt", () => {
    expect(particleProgress(1000, 1000)).toBe(0);
  });

  it("wraps at PARTICLE_PERIOD", () => {
    expect(particleProgress(0, PARTICLE_PERIOD)).toBeCloseTo(0, 5);
    expect(particleProgress(0, PARTICLE_PERIOD * 2)).toBeCloseTo(0, 5);
  });
});

describe("arcPoint", () => {
  const src = { lng: 0, lat: 0 };
  const dst = { lng: 10, lat: 0 };

  it("t=0 returns source (with 0 bump)", () => {
    const [lng, lat] = arcPoint(src, dst, OUT_HEIGHT, 0);
    expect(lng).toBeCloseTo(src.lng, 5);
    expect(lat).toBeCloseTo(src.lat, 5);
  });

  it("t=1 returns destination (with 0 bump)", () => {
    const [lng, lat] = arcPoint(src, dst, OUT_HEIGHT, 1);
    expect(lng).toBeCloseTo(dst.lng, 5);
    expect(lat).toBeCloseTo(dst.lat, 5);
  });

  it("t=0.5 is above the straight-line midpoint when height > 0", () => {
    const [lng, lat] = arcPoint(src, dst, OUT_HEIGHT, 0.5);
    expect(lng).toBeCloseTo(5, 5);
    expect(lat).toBeGreaterThan(0);
  });

  it("higher height => taller bump at midpoint", () => {
    const [, lowLat] = arcPoint(src, dst, IN_HEIGHT, 0.5);
    const [, highLat] = arcPoint(src, dst, OUT_HEIGHT, 0.5);
    expect(highLat).toBeGreaterThan(lowLat);
  });
});
