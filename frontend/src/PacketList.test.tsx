import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { PacketList } from "./PacketList";
import type { PacketState } from "./Map";

function mk(overrides: Partial<PacketState> & { id: string; ts: number }): PacketState {
  return {
    direction: "out",
    proto: "tcp",
    length: 100,
    src: { ip: "192.168.1.10", lat: 0, lng: 0, local: true },
    dst: { ip: "1.1.1.1", lat: 0, lng: 0, local: false, city: "Sydney", country: "AU" },
    addedAt: 0,
    ...overrides,
  };
}

function toMap(packets: PacketState[]): Map<string, PacketState> {
  return new Map(packets.map((p) => [p.id, p]));
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PacketList", () => {
  it("renders one row per packet", () => {
    render(<PacketList packets={toMap([mk({ id: "a", ts: 1 }), mk({ id: "b", ts: 2 }), mk({ id: "c", ts: 3 })])} />);
    const body = screen.getByTestId("packet-list-body");
    expect(body.querySelectorAll("tr")).toHaveLength(3);
  });

  it("newest packet on top", () => {
    render(
      <PacketList
        packets={toMap([
          mk({ id: "old", ts: 10 }),
          mk({ id: "mid", ts: 20 }),
          mk({ id: "new", ts: 30 }),
        ])}
      />
    );
    const rows = screen.getByTestId("packet-list-body").querySelectorAll("tr");
    // First row should contain the "new" packet's dst city
    expect(rows[0].textContent).toContain("Sydney");
    expect(rows).toHaveLength(3);
  });

  it("shows (local) for local side", () => {
    render(<PacketList packets={toMap([mk({ id: "a", ts: 1 })])} />);
    expect(screen.getByText("(local)")).toBeInTheDocument();
  });

  it('shows "city, country" for non-local side', () => {
    render(<PacketList packets={toMap([mk({ id: "a", ts: 1 })])} />);
    expect(screen.getByText("Sydney, AU")).toBeInTheDocument();
  });

  it("missing city and country falls back to Unknown", () => {
    const p = mk({ id: "a", ts: 1 });
    (p.dst as any).city = null;
    (p.dst as any).country = null;
    render(<PacketList packets={toMap([p])} />);
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("active count shown in header", () => {
    render(
      <PacketList
        packets={toMap([mk({ id: "a", ts: 1 }), mk({ id: "b", ts: 2 })])}
      />
    );
    expect(screen.getByTestId("packet-count")).toHaveTextContent("2 active");
  });

  it("overflow footer shown above 200 packets", () => {
    const big: PacketState[] = [];
    for (let i = 0; i < 250; i++) big.push(mk({ id: `p${i}`, ts: i }));
    render(<PacketList packets={toMap(big)} />);
    const rows = screen.getByTestId("packet-list-body").querySelectorAll("tr");
    expect(rows).toHaveLength(200);
    expect(screen.getByTestId("overflow-footer")).toHaveTextContent("50 more hidden");
  });

  it("direction glyph differs for in vs out", () => {
    render(
      <PacketList
        packets={toMap([
          mk({ id: "a", ts: 1, direction: "out" }),
          mk({ id: "b", ts: 2, direction: "in" }),
        ])}
      />
    );
    expect(screen.getByText("↑ out")).toBeInTheDocument();
    expect(screen.getByText("↓ in")).toBeInTheDocument();
  });

  it("expired packet row fades", () => {
    const now = performance.now();
    const p = mk({ id: "a", ts: 1 });
    p.expiredAt = now - 250; // halfway through 500ms fade
    render(<PacketList packets={toMap([p])} />);
    const row = screen.getByTestId("packet-list-body").querySelector("tr")!;
    const opacity = parseFloat((row as HTMLElement).style.opacity);
    expect(opacity).toBeGreaterThan(0.3);
    expect(opacity).toBeLessThan(0.7);
  });
});
