import { describe, it, expect } from "vitest";
import { lerp, colorWithAlpha, FADE_WINDOW_MS, OUT_COLOR, IN_COLOR } from "./Map";
import type { PacketState } from "./Map";

function packet(overrides: Partial<PacketState> = {}): PacketState {
  return {
    id: "x",
    ts: 0,
    direction: "out",
    proto: "tcp",
    length: 100,
    src: { ip: "1.1.1.1", lat: 0, lng: 0 },
    dst: { ip: "8.8.8.8", lat: 10, lng: 10 },
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

describe("colorWithAlpha", () => {
  it("no expiredAt = full alpha + out color", () => {
    const c = colorWithAlpha(packet({ direction: "out" }), 100);
    expect(c.slice(0, 3)).toEqual(OUT_COLOR);
    expect(c[3]).toBe(255);
  });

  it("no expiredAt = full alpha + in color", () => {
    const c = colorWithAlpha(packet({ direction: "in" }), 100);
    expect(c.slice(0, 3)).toEqual(IN_COLOR);
    expect(c[3]).toBe(255);
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
