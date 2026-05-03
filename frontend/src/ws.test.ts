import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WSClient } from "./ws";
import type { ServerMsg } from "./types";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  fakeOpen() {
    this.readyState = 1;
    this.onopen?.();
  }

  fakeMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("WSClient", () => {
  it("opens on connect", () => {
    const c = new WSClient("ws://test/ws");
    c.connect();
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe("ws://test/ws");
  });

  it("dispatches parsed messages to handlers", () => {
    const c = new WSClient("ws://test/ws");
    const seen: ServerMsg[] = [];
    c.onMessage((m) => seen.push(m));
    c.connect();
    const ws = MockWebSocket.instances[0];
    ws.fakeOpen();
    ws.fakeMessage({ type: "status", data: { capturing: true } });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ type: "status", data: { capturing: true } });
  });

  it("send before open is noop", () => {
    const c = new WSClient("ws://test/ws");
    c.connect();
    c.send({ type: "start" });
    const ws = MockWebSocket.instances[0];
    expect(ws.sent).toHaveLength(0);
  });

  it("send after open writes", () => {
    const c = new WSClient("ws://test/ws");
    c.connect();
    const ws = MockWebSocket.instances[0];
    ws.fakeOpen();
    c.send({ type: "start" });
    expect(ws.sent).toEqual([JSON.stringify({ type: "start" })]);
  });

  it("reconnects after close with backoff", () => {
    const c = new WSClient("ws://test/ws");
    c.connect();
    MockWebSocket.instances[0].close();
    expect(MockWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(500);
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("backoff doubles, capped at 5s", () => {
    const c = new WSClient("ws://test/ws");
    c.connect();

    // close 1 -> 500ms
    MockWebSocket.instances[0].close();
    vi.advanceTimersByTime(500);
    expect(MockWebSocket.instances).toHaveLength(2);

    // close 2 -> 1000ms
    MockWebSocket.instances[1].close();
    vi.advanceTimersByTime(999);
    expect(MockWebSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(MockWebSocket.instances).toHaveLength(3);

    // close 3 -> 2000ms
    MockWebSocket.instances[2].close();
    vi.advanceTimersByTime(2000);
    expect(MockWebSocket.instances).toHaveLength(4);
  });

  it("close() stops reconnect", () => {
    const c = new WSClient("ws://test/ws");
    c.connect();
    c.close();
    vi.advanceTimersByTime(10_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });
});
