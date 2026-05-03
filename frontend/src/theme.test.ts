import { describe, it, expect } from "vitest";
import { themes, DEFAULT_THEME } from "./theme";

describe("themes", () => {
  it("all three themes exist", () => {
    expect(themes.console).toBeDefined();
    expect(themes.space).toBeDefined();
    expect(themes.paper).toBeDefined();
  });

  it("each theme has the full token set", () => {
    for (const t of Object.values(themes)) {
      expect(t.bg).toBeTruthy();
      expect(t.land).toHaveLength(3);
      expect(t.landBorder).toHaveLength(3);
      expect(t.panel).toBeTruthy();
      expect(t.panelBorder).toBeTruthy();
      expect(t.text).toBeTruthy();
      expect(t.textMuted).toBeTruthy();
      expect(t.accent).toBeTruthy();
      expect(t.proto.tcp).toHaveLength(3);
      expect(t.proto.udp).toHaveLength(3);
      expect(t.proto.icmp).toHaveLength(3);
      expect(t.proto.other).toHaveLength(3);
    }
  });

  it("modes are correct", () => {
    expect(themes.console.mode).toBe("dark");
    expect(themes.space.mode).toBe("dark");
    expect(themes.paper.mode).toBe("light");
  });

  it("default theme is console", () => {
    expect(DEFAULT_THEME).toBe("console");
  });

  it("ids match keys", () => {
    for (const [key, t] of Object.entries(themes)) {
      expect(t.id).toBe(key);
    }
  });
});
