export type Direction = "in" | "out";

export type GeoRef = {
  ip: string;
  lat: number;
  lng: number;
  city?: string;
  country?: string;
};

export type PacketDTO = {
  id: string;
  ts: number;
  direction: Direction;
  proto: string;
  length: number;
  src: GeoRef;
  dst: GeoRef;
};

export type ServerMsg =
  | { type: "status"; data: { capturing: boolean; warning?: string } }
  | { type: "snapshot"; data: PacketDTO[] }
  | { type: "packet"; data: PacketDTO }
  | { type: "expire"; data: { id: string } }
  | { type: "error"; data: { code: string; message: string } };

export type ClientMsg = { type: "start" } | { type: "stop" };
