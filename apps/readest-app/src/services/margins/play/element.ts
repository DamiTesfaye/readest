export type PlayElementShape =
  | { id: string; type: 'circle'; r: number; pad: number }
  | { id: string; type: 'polygon'; pts: [number, number][]; pad: number };

export interface PlayElement {
  id: string;
  kind: 'play';
  frame: { x: number; y: number; w: number; r: number };
  contract: 'displace' | 'detach';
  alt: string;
  shapes?: PlayElementShape[] | null;
  poses?: { shape: string; x: number; y: number; rot: number }[] | null;
  shapeMotion?: 'none' | 'drift' | null;
  detach?: {
    unit: 'glyph' | 'word' | 'line';
    spans: [number, number][];
    sink: 'floor';
    seed: number;
  } | null;
}

export const PLAY_ALT_MAX = 300;
const MAX_SHAPES = 16;
const MAX_POINTS = 256;
const MAX_TOTAL_POINTS = 800;
const MAX_SPANS = 64;
const MAX_EM = 1000;

export const round2 = (v: number) => Math.round(v * 100) / 100;
const scalars = (s: string) => [...s].length;
const num = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= MAX_EM;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const scalarsToBytes = (
  canonical: Uint8Array,
  anchorStart: number,
  spans: [number, number][],
): [number, number][] => {
  const offsets = [0];
  for (const ch of dec.decode(canonical.subarray(anchorStart)))
    offsets.push(offsets[offsets.length - 1]! + enc.encode(ch).length);
  const at = (n: number) => anchorStart + offsets[Math.min(n, offsets.length - 1)]!;
  return spans.map(([s, e]) => [at(s), at(e)]);
};

export const bytesToScalars = (
  canonical: Uint8Array,
  anchorStart: number,
  spans: [number, number][],
): [number, number][] => {
  const count = (end: number) => scalars(dec.decode(canonical.subarray(anchorStart, end)));
  return spans.map(([s, e]) => [count(s), count(e)]);
};

export const validatePlayElement = (raw: unknown, anchorLen: number): string | null => {
  const el = raw as PlayElement;
  const alt = typeof el.alt === 'string' ? scalars(el.alt) : 0;
  if (alt < 1 || alt > PLAY_ALT_MAX) return 'alt';
  if (el.shapes != null && !Array.isArray(el.shapes)) return 'shapes';
  const shapes = el.shapes ?? [];
  if (shapes.some((s) => s?.type !== 'circle' && s?.type !== 'polygon')) return 'unknown';
  if (shapes.length > MAX_SHAPES) return 'shapes';
  const points = shapes.reduce((n, s) => n + (s.type === 'polygon' ? s.pts.length : 0), 0);
  const badPolygon = shapes.some(
    (s) => s.type === 'polygon' && (s.pts.length < 3 || s.pts.length > MAX_POINTS),
  );
  if (badPolygon || points > MAX_TOTAL_POINTS) return 'points';
  const badShape = shapes.some(
    (s) =>
      !num(s.pad) ||
      s.pad < 0 ||
      (s.type === 'circle' ? !num(s.r) || s.r <= 0 : s.pts.flat().some((v) => !num(v))),
  );
  const badPose = (el.poses ?? []).some((p) => !num(p.x) || !num(p.y) || !Number.isFinite(p.rot));
  if (badShape || badPose) return 'geometry';
  if (![undefined, null, 'none', 'drift'].includes(el.shapeMotion)) return 'motion';
  const d = el.detach;
  if (d) {
    if (!['glyph', 'word', 'line'].includes(d.unit) || d.sink !== 'floor') return 'detach';
    const badSpan = ([s, e]: [number, number]) =>
      !(Number.isInteger(s) && Number.isInteger(e) && s >= 0 && s < e && e <= anchorLen);
    if (d.spans.length > MAX_SPANS || d.spans.some(badSpan)) return 'span';
  }
  if (el.contract !== 'displace' && el.contract !== 'detach') return 'contract';
  if ((el.contract === 'displace') !== shapes.length > 0 || (el.contract === 'detach' && !d))
    return 'contract';
  return null;
};
