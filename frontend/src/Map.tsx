import { useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import { ArcLayer, GeoJsonLayer } from "@deck.gl/layers";
import type { PacketDTO } from "./types";
import { useTheme, type Theme } from "./theme";

export type PacketState = PacketDTO & { addedAt: number; expiredAt?: number };

type Props = {
  packets: Map<string, PacketState>;
};

const GROW_MS = 400;
const FADE_MS = 500;

export const PROTO_COLORS = {
  tcp: [74, 158, 255],
  udp: [74, 222, 128],
  icmp: [232, 121, 249],
  other: [148, 163, 184],
} as const satisfies Record<string, [number, number, number]>;

export const OUT_HEIGHT = 0.8;
export const IN_HEIGHT = 0.15;

export function protoColor(proto: string): [number, number, number] {
  const key = (proto as keyof typeof PROTO_COLORS) in PROTO_COLORS ? (proto as keyof typeof PROTO_COLORS) : "other";
  return PROTO_COLORS[key] as [number, number, number];
}

const INITIAL_VIEW = {
  longitude: 0,
  latitude: 20,
  zoom: 1.2,
  pitch: 0,
  bearing: 0,
};

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export const FADE_WINDOW_MS = FADE_MS;

export function MapView({ packets }: Props) {
  const theme = useTheme();
  const [tick, setTick] = useState(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const step = () => {
      setTick((t) => (t + 1) % 1_000_000);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, []);

  const [countries, setCountries] = useState<any>(null);
  useEffect(() => {
    fetch("/countries.geojson")
      .then((r) => r.json())
      .then(setCountries)
      .catch(() => setCountries(null));
  }, []);

  const data = useMemo(() => Array.from(packets.values()), [packets, tick]);

  const countriesLayer = new GeoJsonLayer({
    id: "countries",
    data: countries ?? { type: "FeatureCollection", features: [] },
    stroked: true,
    filled: true,
    getFillColor: theme.land,
    getLineColor: theme.landBorder,
    lineWidthMinPixels: 0.5,
    updateTriggers: {
      getFillColor: theme.id,
      getLineColor: theme.id,
    },
  });

  const now = performance.now();

  const arcsLayer = new ArcLayer<PacketState>({
    id: "arcs",
    data,
    getSourcePosition: (p) => [p.src.lng, p.src.lat],
    getTargetPosition: (p) => {
      const grow = Math.min(1, (now - p.addedAt) / GROW_MS);
      return [lerp(p.src.lng, p.dst.lng, grow), lerp(p.src.lat, p.dst.lat, grow)];
    },
    getSourceColor: (p) => colorWithAlpha(p, now, theme),
    getTargetColor: (p) => colorWithAlpha(p, now, theme),
    getHeight: (p) => (p.direction === "out" ? OUT_HEIGHT : IN_HEIGHT),
    getWidth: 2,
    updateTriggers: {
      getTargetPosition: tick,
      getSourceColor: [tick, theme.id],
      getTargetColor: [tick, theme.id],
      getHeight: tick,
    },
  });

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <DeckGL
        initialViewState={INITIAL_VIEW}
        controller={true}
        layers={[countriesLayer, arcsLayer]}
      />
      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 12,
          fontSize: 11,
          opacity: 0.6,
          pointerEvents: "none",
        }}
      >
        Geo data by DB-IP
      </div>
    </div>
  );
}

export function colorWithAlpha(
  p: PacketState,
  now: number,
  theme?: Theme,
): [number, number, number, number] {
  const key = (p.proto as keyof typeof PROTO_COLORS) in PROTO_COLORS
    ? (p.proto as keyof typeof PROTO_COLORS)
    : "other";
  const base = theme ? theme.proto[key] : PROTO_COLORS[key];
  let a = 1;
  if (p.expiredAt !== undefined) {
    a = Math.max(0, 1 - (now - p.expiredAt) / FADE_MS);
  }
  return [base[0], base[1], base[2], Math.round(a * 255)];
}
