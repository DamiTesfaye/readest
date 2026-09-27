export type InkPoint = [x: number, y: number, pressure: number];

export interface InkSegment {
  x: number;
  y: number;
  w: number;
  h: number;
  points: string;
}

const QUANT = 8;
const MAX_POINTS_PER_RECORD = 600;
const INT16_MAX = 32767;
const MAX_STEP = (INT16_MAX - 1) / QUANT;
const HEADER_BYTES = 17;
const STEP_BYTES = 5;

const snapCoordinate = (value: number): number => Math.round(value * QUANT) / QUANT;

const pressureByte = (pressure: number): number =>
  Math.round(Math.max(0, Math.min(1, pressure)) * 255);

const bridge = (from: InkPoint, to: InkPoint): InkPoint[] => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / MAX_STEP));
  return Array.from({ length: steps }, (_, i): InkPoint => {
    if (i === steps - 1) return to;
    const t = (i + 1) / steps;
    return [snapCoordinate(from[0] + dx * t), snapCoordinate(from[1] + dy * t), to[2]];
  });
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const fromBase64 = (encoded: string): Uint8Array | null => {
  try {
    return Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
};

const encodePoints = (points: InkPoint[]): string => {
  const first = points[0]!;
  const view = new DataView(new ArrayBuffer(HEADER_BYTES + (points.length - 1) * STEP_BYTES));
  view.setFloat64(0, first[0], true);
  view.setFloat64(8, first[1], true);
  view.setUint8(16, pressureByte(first[2]));
  for (let i = 1; i < points.length; i += 1) {
    const offset = HEADER_BYTES + (i - 1) * STEP_BYTES;
    const previous = points[i - 1]!;
    const point = points[i]!;
    view.setInt16(offset, Math.round((point[0] - previous[0]) * QUANT), true);
    view.setInt16(offset + 2, Math.round((point[1] - previous[1]) * QUANT), true);
    view.setUint8(offset + 4, pressureByte(point[2]));
  }
  return toBase64(new Uint8Array(view.buffer));
};

const toSegment = (points: InkPoint[]): InkSegment => {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x,
    y,
    w: Math.max(...xs) - x,
    h: Math.max(...ys) - y,
    points: encodePoints(points.map(([px, py, pressure]): InkPoint => [px - x, py - y, pressure])),
  };
};

export const encodeInkStroke = (points: InkPoint[]): InkSegment[] => {
  const groups: InkPoint[][] = [];
  let current: InkPoint[] = [];
  for (const [x, y, pressure] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const point: InkPoint = [snapCoordinate(x), snapCoordinate(y), pressureByte(pressure) / 255];
    const previous = current[current.length - 1];
    for (const next of previous ? bridge(previous, point) : [point]) {
      if (current.length === MAX_POINTS_PER_RECORD) {
        groups.push(current);
        current = [current[current.length - 1]!, next];
      } else {
        current.push(next);
      }
    }
  }
  if (current.length > 0) groups.push(current);
  return groups.map(toSegment);
};

export const decodeInk = (encoded: string): InkPoint[] => {
  const bytes = fromBase64(encoded);
  if (!bytes || bytes.length < HEADER_BYTES || (bytes.length - HEADER_BYTES) % STEP_BYTES !== 0) {
    return [];
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let x = view.getFloat64(0, true);
  let y = view.getFloat64(8, true);
  const points: InkPoint[] = [[x, y, view.getUint8(16) / 255]];
  for (let offset = HEADER_BYTES; offset < bytes.length; offset += STEP_BYTES) {
    x += view.getInt16(offset, true) / QUANT;
    y += view.getInt16(offset + 2, true) / QUANT;
    points.push([x, y, view.getUint8(offset + 4) / 255]);
  }
  return points;
};

export const absoluteInkPoints = (record: { x: number; y: number; points: string }): InkPoint[] =>
  decodeInk(record.points).map(
    ([px, py, pressure]): InkPoint => [record.x + px, record.y + py, pressure],
  );
