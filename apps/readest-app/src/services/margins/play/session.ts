import type { KeepResult } from './keep';
import type { Tier } from './tiers';

export type Unit = 'glyph' | 'word' | 'line';

export interface PlayShape {
  id: string;
  type: 'circle' | 'polygon';
  r?: number;
  pts?: [number, number][];
  pad: number;
}

export interface Pose {
  shape: string;
  x: number;
  y: number;
  rot: number;
}

export interface SessionState {
  shapes: PlayShape[];
  poses: Pose[];
  detached: [number, number][];
  unit: Unit;
  shapeMotion: 'none' | 'drift';
  seed: number;
  undo: [number, number][][];
}

export const initialSession = (seed: number): SessionState => ({
  shapes: [],
  poses: [],
  detached: [],
  unit: 'glyph',
  shapeMotion: 'none',
  seed,
  undo: [],
});

export const addShape = (
  s: SessionState,
  type: PlayShape['type'],
  at: { x: number; y: number },
  em: number,
): SessionState => {
  const id = `s${Math.max(0, ...s.shapes.map((x) => Number(x.id.slice(1)))) + 1}`;
  const shape: PlayShape =
    type === 'circle'
      ? { id, type, r: em * 3, pad: em * 0.4 }
      : {
          id,
          type,
          pts: [
            [-em * 3, em * 2],
            [em * 3, em * 2],
            [0, -em * 3],
          ],
          pad: em * 0.4,
        };
  return {
    ...s,
    shapes: [...s.shapes, shape],
    poses: [...s.poses, { shape: id, ...at, rot: 0 }],
  };
};

export const removeShape = (s: SessionState, id: string): SessionState => ({
  ...s,
  shapes: s.shapes.filter((x) => x.id !== id),
  poses: s.poses.filter((p) => p.shape !== id),
});

export const moveShape = (s: SessionState, id: string, dx: number, dy: number): SessionState => ({
  ...s,
  poses: s.poses.map((p) => (p.shape === id ? { ...p, x: p.x + dx, y: p.y + dy } : p)),
});

export const detach = (s: SessionState, spans: [number, number][]): SessionState =>
  spans.length === 0 ? s : { ...s, detached: [...s.detached, ...spans], undo: [...s.undo, spans] };

export const undo = (s: SessionState): SessionState => {
  const last = s.undo[s.undo.length - 1];
  if (!last) return s;
  const drop = new Set(last.map(([a, b]) => `${a}:${b}`));
  return {
    ...s,
    detached: s.detached.filter(([a, b]) => !drop.has(`${a}:${b}`)),
    undo: s.undo.slice(0, -1),
  };
};

const JOINING = /\p{Script=Arabic}|\p{Script=Syriac}|\p{Script=Nko}|\p{Script=Mongolian}/u;

export const unitFor = (unit: Unit, text: string): Unit =>
  unit === 'glyph' && JOINING.test(text) ? 'word' : unit;

const enc = new TextEncoder();

const byteSpans = (text: string, re: RegExp, windowStart: number): [number, number][] =>
  [...text.matchAll(re)].map((m) => {
    const s = windowStart + enc.encode(text.slice(0, m.index)).length;
    return [s, s + enc.encode(m[0]).length];
  });

type Span = [number, number];

const free =
  (taken: readonly Span[]) =>
  ([s, e]: Span) =>
    !taken.some(([a, b]) => a < e && s < b);

const WORD = /[\p{L}\p{N}][\p{L}\p{N}\p{M}'’-]*/gu;

export const nextWordSpan = (
  text: string,
  windowStart: number,
  after: number,
  unit: Unit,
  taken: readonly Span[] = [],
): Span | null => {
  const re = unit === 'line' ? /[^\n]+/g : WORD;
  return (
    byteSpans(text, re, windowStart)
      .filter(free(taken))
      .find(([s]) => s >= after) ?? null
  );
};

export const wordSpanAt = (text: string, windowStart: number, byte: number): Span | null =>
  byteSpans(text, WORD, windowStart).find(([s, e]) => s <= byte && byte < e) ?? null;

export const lastSentenceSpan = (
  text: string,
  windowStart: number,
  visibleEnd: number,
  taken: readonly Span[] = [],
): Span | null => {
  const spans = byteSpans(text, /[^\s.!?][^.!?\n]*[.!?]+["’”)]*/g, windowStart)
    .filter(([, e]) => e <= visibleEnd)
    .filter(free(taken));
  return spans[spans.length - 1] ?? null;
};

export interface PlayToolsState {
  active: boolean;
  tier: Tier;
  font: 'reader' | 'standIn';
  reason?: string;
  canUndo: boolean;
  unit: Unit | null;
  shapeMotion: 'none' | 'drift';
}

export type PlayKeepResult = KeepResult & {
  dropped?: number;
  truncated?: boolean;
  scene?: 'saved' | 'failed';
};

export interface PlayTools {
  enter(margin?: string): Promise<void>;
  exit(): void;
  keep(alt: string): Promise<PlayKeepResult>;
  addShape(kind: 'circle' | 'polygon'): string;
  removeShape(id: string): void;
  setShapeMotion(preset: 'none' | 'drift'): void;
  detachMode(unit: Unit | null): void;
  detachNext(): void;
  shake(): void;
  undo(): void;
  canUndo(): boolean;
  readonly state: PlayToolsState;
}
