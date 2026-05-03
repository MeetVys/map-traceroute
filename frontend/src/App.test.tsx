import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ServerMsg, ClientMsg } from "./types";

// Stub Map so we don't render deck.gl in jsdom
vi.mock("./Map", () => ({
  MapView: () => <div data-testid="map" />,
}));

// Intercept WSClient
const handlers: ((m: ServerMsg) => void)[] = [];
const sent: ClientMsg[] = [];
const mockConnect = vi.fn();
const mockClose = vi.fn();

vi.mock("./ws", () => ({
  WSClient: class {
    constructor(public url: string) {}
    connect = mockConnect;
    close = mockClose;
    send = (m: ClientMsg) => sent.push(m);
    onMessage = (h: (m: ServerMsg) => void) => handlers.push(h);
  },
}));

function emit(m: ServerMsg) {
  act(() => {
    handlers.forEach((h) => h(m));
  });
}

beforeEach(() => {
  handlers.length = 0;
  sent.length = 0;
  mockConnect.mockClear();
  mockClose.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

async function loadApp() {
  const mod = await import("./App");
  return mod.App;
}

describe("App", () => {
  it("status message toggles capturing state", async () => {
    const App = await loadApp();
    render(<App />);
    emit({ type: "status", data: { capturing: true } });
    expect(screen.getByText("Start")).toBeDisabled();
    expect(screen.getByText("Stop")).not.toBeDisabled();
  });

  it("packet message increments counter", async () => {
    const App = await loadApp();
    render(<App />);
    emit({
      type: "packet",
      data: {
        id: "p1",
        ts: 0,
        direction: "out",
        proto: "tcp",
        length: 100,
        src: { ip: "1.1.1.1", lat: 0, lng: 0, local: false },
        dst: { ip: "8.8.8.8", lat: 10, lng: 10, local: false },
      },
    });
    expect(screen.getByText(/packets: 1/)).toBeInTheDocument();
  });

  it("click Start sends start message", async () => {
    const App = await loadApp();
    render(<App />);
    await userEvent.click(screen.getByText("Start"));
    expect(sent).toEqual([{ type: "start" }]);
  });

  it("click Stop sends stop message", async () => {
    const App = await loadApp();
    render(<App />);
    emit({ type: "status", data: { capturing: true } });
    await userEvent.click(screen.getByText("Stop"));
    expect(sent).toEqual([{ type: "stop" }]);
  });

  it("error message renders error banner", async () => {
    const App = await loadApp();
    render(<App />);
    emit({ type: "error", data: { code: "x", message: "boom" } });
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("snapshot replaces packet state", async () => {
    const App = await loadApp();
    render(<App />);
    emit({
      type: "snapshot",
      data: [
        {
          id: "a",
          ts: 0,
          direction: "out",
          proto: "tcp",
          length: 100,
          src: { ip: "1.1.1.1", lat: 0, lng: 0, local: false },
          dst: { ip: "8.8.8.8", lat: 10, lng: 10, local: false },
        },
        {
          id: "b",
          ts: 0,
          direction: "in",
          proto: "udp",
          length: 64,
          src: { ip: "8.8.8.8", lat: 10, lng: 10, local: false },
          dst: { ip: "1.1.1.1", lat: 0, lng: 0, local: false },
        },
      ],
    });
    expect(screen.getByText(/packets: 2/)).toBeInTheDocument();
  });
});
