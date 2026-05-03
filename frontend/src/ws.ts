import type { ClientMsg, ServerMsg } from "./types";

export class WSClient {
  private ws?: WebSocket;
  private handlers: ((m: ServerMsg) => void)[] = [];
  private closed = false;
  private backoff = 500;

  constructor(private url: string) {}

  connect(): void {
    this.closed = false;
    this.open();
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }

  send(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  onMessage(h: (m: ServerMsg) => void): void {
    this.handlers.push(h);
  }

  private open(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onmessage = (ev) => {
      try {
        const m: ServerMsg = JSON.parse(ev.data);
        this.handlers.forEach((h) => h(m));
      } catch {
        /* ignore */
      }
    };
    ws.onopen = () => {
      this.backoff = 500;
    };
    ws.onclose = () => {
      if (this.closed) return;
      setTimeout(() => this.open(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 5000);
    };
    ws.onerror = () => ws.close();
  }
}
