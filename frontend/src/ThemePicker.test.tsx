import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ThemePicker } from "./ThemePicker";
import {
  ThemeContext,
  themes,
  applyThemeToRoot,
  resolveInitialTheme,
  STORAGE_KEY,
  type ThemeId,
} from "./theme";

function Harness() {
  const [id, setId] = useState<ThemeId>(() => resolveInitialTheme());
  const theme = themes[id];
  return (
    <ThemeContext.Provider
      value={{
        theme,
        setThemeId: (next) => {
          setId(next);
          applyThemeToRoot(themes[next]);
          window.localStorage.setItem(STORAGE_KEY, next);
        },
      }}
    >
      <ThemePicker />
    </ThemeContext.Provider>
  );
}

function installLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const fake = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, "localStorage", { configurable: true, value: fake });
}

beforeEach(() => {
  installLocalStorage();
  document.documentElement.removeAttribute("style");
  document.documentElement.removeAttribute("data-theme");
});

describe("ThemePicker", () => {
  it("renders three options", () => {
    render(<Harness />);
    const select = screen.getByLabelText("Theme") as HTMLSelectElement;
    expect(select.options).toHaveLength(3);
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toContain("console");
    expect(values).toContain("space");
    expect(values).toContain("paper");
  });

  it("default selection is console when no localStorage", () => {
    render(<Harness />);
    const select = screen.getByLabelText("Theme") as HTMLSelectElement;
    expect(select.value).toBe("console");
  });

  it("respects prefers-color-scheme: light when no localStorage", () => {
    const origMM = window.matchMedia;
    window.matchMedia = ((q: string) =>
      ({
        matches: q.includes("light"),
        media: q,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      } as unknown as MediaQueryList)) as typeof window.matchMedia;
    render(<Harness />);
    const select = screen.getByLabelText("Theme") as HTMLSelectElement;
    expect(select.value).toBe("paper");
    window.matchMedia = origMM;
  });

  it("changing selection updates localStorage", async () => {
    render(<Harness />);
    const select = screen.getByLabelText("Theme") as HTMLSelectElement;
    await userEvent.selectOptions(select, "space");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("space");
  });

  it("changing selection sets CSS vars on <html>", async () => {
    render(<Harness />);
    const select = screen.getByLabelText("Theme") as HTMLSelectElement;
    await userEvent.selectOptions(select, "paper");
    const bg = document.documentElement.style.getPropertyValue("--bg");
    expect(bg).toBe(themes.paper.bg);
    expect(document.documentElement.getAttribute("data-theme")).toBe("paper");
  });

  it("pre-existing localStorage value is restored on mount", () => {
    installLocalStorage({ [STORAGE_KEY]: "paper" });
    render(<Harness />);
    const select = screen.getByLabelText("Theme") as HTMLSelectElement;
    expect(select.value).toBe("paper");
  });
});
