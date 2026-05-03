import "@testing-library/jest-dom";

// jsdom lacks matchMedia; default to "not matching" so resolveInitialTheme
// returns the default theme instead of throwing.
if (typeof window.matchMedia !== "function") {
  window.matchMedia = ((q: string) =>
    ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as unknown as MediaQueryList)) as typeof window.matchMedia;
}

// jsdom has localStorage; nothing to do.
