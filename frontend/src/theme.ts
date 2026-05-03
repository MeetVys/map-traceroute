import { createContext, useContext } from "react";

export type ThemeId = "console" | "space" | "paper";
export type ProtoKey = "tcp" | "udp" | "icmp" | "other";

export type Theme = {
  id: ThemeId;
  label: string;
  mode: "dark" | "light";
  bg: string;
  land: [number, number, number];
  landBorder: [number, number, number];
  panel: string;
  panelBorder: string;
  text: string;
  textMuted: string;
  accent: string;
  proto: Record<ProtoKey, [number, number, number]>;
};

export const themes: Record<ThemeId, Theme> = {
  console: {
    id: "console",
    label: "Console at night",
    mode: "dark",
    bg: "#0d1117",
    land: [22, 27, 34],
    landBorder: [48, 54, 61],
    panel: "#161b22",
    panelBorder: "#30363d",
    text: "#e6edf3",
    textMuted: "#8b949e",
    accent: "#58a6ff",
    proto: {
      tcp: [88, 166, 255],
      udp: [63, 185, 80],
      icmp: [210, 168, 255],
      other: [139, 148, 158],
    },
  },
  space: {
    id: "space",
    label: "Space map",
    mode: "dark",
    bg: "#05060f",
    land: [14, 21, 48],
    landBorder: [42, 58, 110],
    panel: "rgba(10, 15, 31, 0.9)",
    panelBorder: "#1f2a4a",
    text: "#e2e8f0",
    textMuted: "#94a3b8",
    accent: "#22d3ee",
    proto: {
      tcp: [96, 165, 250],
      udp: [52, 211, 153],
      icmp: [244, 114, 182],
      other: [148, 163, 184],
    },
  },
  paper: {
    id: "paper",
    label: "Topographic paper",
    mode: "light",
    bg: "#f5f1e8",
    land: [231, 224, 207],
    landBorder: [196, 187, 165],
    panel: "#ffffff",
    panelBorder: "#d6ccb4",
    text: "#1f2937",
    textMuted: "#57534e",
    accent: "#b45309",
    proto: {
      tcp: [30, 64, 175],
      udp: [21, 128, 61],
      icmp: [190, 24, 93],
      other: [87, 83, 78],
    },
  },
};

export const DEFAULT_THEME: ThemeId = "console";
export const STORAGE_KEY = "mt.theme";

export function resolveInitialTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    if (stored && stored in themes) return stored as ThemeId;
  } catch {
    /* localStorage unavailable */
  }
  try {
    if (typeof window.matchMedia === "function") {
      const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
      return prefersLight ? "paper" : DEFAULT_THEME;
    }
  } catch {
    /* matchMedia unavailable */
  }
  return DEFAULT_THEME;
}

export function applyThemeToRoot(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--bg", theme.bg);
  root.style.setProperty("--panel", theme.panel);
  root.style.setProperty("--panel-border", theme.panelBorder);
  root.style.setProperty("--text", theme.text);
  root.style.setProperty("--text-muted", theme.textMuted);
  root.style.setProperty("--accent", theme.accent);
  root.setAttribute("data-theme", theme.id);
  document.body.style.background = theme.bg;
  document.body.style.color = theme.text;
}

type Ctx = { theme: Theme; setThemeId: (id: ThemeId) => void };

export const ThemeContext = createContext<Ctx>({
  theme: themes[DEFAULT_THEME],
  setThemeId: () => {},
});

export function useTheme(): Theme {
  return useContext(ThemeContext).theme;
}

export function useThemeController(): Ctx {
  return useContext(ThemeContext);
}
