import { useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import { ArcLayer, GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { PacketDTO } from "./types";

export type PacketState = PacketDTO & { addedAt: number; expiredAt?: number };

type Props = {
  packets: Map<string, PacketState>;
};

const GROW_MS = 400;
const FADE_MS = 500;
const PARTICLE_PERIOD_MS = 1000;
const SOURCE_DIM = 0.6;  // source end drawn at 60% brightness (gradient cue)

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
export const PARTICLE_PERIOD = PARTICLE_PERIOD_MS;

export function particleProgress(addedAt: number, now: number): number {
  const t = ((now - addedAt) % PARTICLE_PERIOD_MS) / PARTICLE_PERIOD_MS;
  return t < 0 ? t + 1 : t;
}

/**
 * Sample a point along the visible arc between src and dst.
 * Approximates deck.gl's arc: linear interpolation in lat/lng plus
 * a parabolic height bump `4*h*t*(1-t)`, scaled to map units.
 */
export function arcPoint(
  src: { lng: number; lat: number },
  dst: { lng: number; lat: number },
  height: number,
  t: number,
): [number, number] {
  const lng = lerp(src.lng, dst.lng, t);
  const lat = lerp(src.lat, dst.lat, t);
  // ArcLayer's vertical bump; expressed in degrees of latitude for on-screen placement.
  // Scale so OUT_HEIGHT looks like a noticeable arch at typical zoom.
  const bump = 4 * height * t * (1 - t) * 20;
  return [lng, lat + bump];
}

export function MapView({ packets }: Props) {
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
    getFillColor: [20, 25, 40],
    getLineColor: [60, 70, 90],
    lineWidthMinPixels: 0.5,
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
    getSourceColor: (p) => colorWithAlpha(p, now, SOURCE_DIM),
    getTargetColor: (p) => colorWithAlpha(p, now),
    getHeight: (p) => (p.direction === "out" ? OUT_HEIGHT : IN_HEIGHT),
    getWidth: 2,
    updateTriggers: {
      getTargetPosition: tick,
      getSourceColor: tick,
      getTargetColor: tick,
      getHeight: tick,
    },
  });

  const particlesLayer = new ScatterplotLayer<PacketState>({
    id: "particles",
    data,
    getPosition: (p) => {
      const grow = Math.min(1, (now - p.addedAt) / GROW_MS);
      const t = particleProgress(p.addedAt, now) * grow;
      const h = p.direction === "out" ? OUT_HEIGHT : IN_HEIGHT;
      return arcPoint(p.src, p.dst, h, t);
    },
    getFillColor: (p) => colorWithAlpha(p, now),
    getRadius: 4,
    radiusUnits: "pixels",
    stroked: false,
    updateTriggers: {
      getPosition: tick,
      getFillColor: tick,
    },
  });

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <DeckGL
        initialViewState={INITIAL_VIEW}
        controller={true}
        layers={[countriesLayer, arcsLayer, particlesLayer]}
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
  brightness: number = 1,
): [number, number, number, number] {
  const base = protoColor(p.proto);
  let a = 1;
  if (p.expiredAt !== undefined) {
    a = Math.max(0, 1 - (now - p.expiredAt) / FADE_MS);
  }
  return [
    Math.round(base[0] * brightness),
    Math.round(base[1] * brightness),
    Math.round(base[2] * brightness),
    Math.round(a * 255),
  ];
}
