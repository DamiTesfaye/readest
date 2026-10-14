import { gunzipSync, gzipSync, strFromU8, strToU8 } from 'fflate';
import { round2 } from '../play/element';
import { STAND_IN_FACES } from '../play/fonts';
import type { Scene } from './types';

export type { Scene } from './types';

export const STEP_HZ = 120;
export const MAX_STEPS = 7200;
export const MAX_EVENTS = 20000;
export const MAX_BOXES = 2000;
export const CHECKPOINT_EVERY = 600;
export const SCENE_GZIP_MAX = 262144;
export const SCENE_RAW_MAX = 2097152;
export const SCENE_MIME = 'application/vnd.ampleread.scene+gzip';
export const EV = { DOWN: 0, MOVE: 1, UP: 2, TOOL: 4, SHAPE_ADD: 5, SHAPE_REMOVE: 6 } as const;
export const TOOL = { MOTION: 1, DETACH: 2, UNDO: 3 } as const;

export interface SceneSource {
  glyphs: Float32Array;
  lines: Float32Array;
  text: Uint8Array;
  windowStart: number;
  em: number;
  box: { width: number; height: number };
  columns: number;
  gutter: number;
  font: string;
  unit: 'glyph' | 'word' | 'line';
  passage: { startByte: number; endByte: number; start: number; end: number };
  seed: number;
}

const STRIDE = 10;
const LINE_STRIDE = 7;
const Q_EM = 0.25;
export const SFX_ID = /^[a-z0-9-]{1,32}$/;
const SFX_PATH = /^\/sfx\/\d+\/1$/;
const FACES: readonly string[] = [...STAND_IN_FACES.serif, ...STAND_IN_FACES.sans];

const grid = (v: number) => Math.round(v / Q_EM) * Q_EM;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

const wordRuns = (src: SceneSource, first: number, count: number) => {
  const { glyphs, text, windowStart } = src;
  const dec = new TextDecoder();
  const runs: number[][] = [];
  let run: number[] = [];
  for (let i = first; i < first + count; i++) {
    const o = i * STRIDE;
    const at = glyphs[o + 7]! - windowStart;
    const space = /^\s+$/u.test(dec.decode(text.subarray(at, at + glyphs[o + 8]!)));
    if ((glyphs[o + 9]! & 1) === 0 || space) {
      if (run.length > 0) runs.push(run);
      run = [];
    } else run.push(o);
  }
  if (run.length > 0) runs.push(run);
  return runs;
};

export const buildScene = (
  src: SceneSource,
  events: number[][],
  sfx: Scene['sfx'] = [],
): { scene: Scene; unitOf(canon: number): number } => {
  const { glyphs, lines, em } = src;
  const sceneLines: Scene['lines'] = [];
  const sceneGlyphs: [number, number, number, number][] = [];
  const units = new Map<number, number>();
  const passage: [number, number] = [-1, -1];
  let words = 0;
  for (let l = 0; l < lines.length; l += LINE_STRIDE) {
    const [base, ascent, descent] = [lines[l + 2]!, lines[l + 3]!, lines[l + 4]!];
    const runs = wordRuns(src, lines[l + 5]!, lines[l + 6]!);
    if (runs.length === 0) continue;
    const h = round2((ascent + descent) / em);
    const boxes = runs.map((run, b): [number, number, number] => {
      const [f, z] = [run[0]!, run[run.length - 1]!];
      const x = round2(glyphs[f]! / em);
      const w = round2((glyphs[z]! + glyphs[z + 2]! - glyphs[f]!) / em);
      const from = grid(x);
      const qw = Math.max(Q_EM, grid(x + w) - from);
      const first = glyphs[f + 7]!;
      if (first >= src.passage.startByte && first < src.passage.endByte) {
        if (passage[0] < 0) passage[0] = words;
        passage[1] = words + 1;
      }
      run.forEach((o, k) => {
        const unit = src.unit === 'glyph' ? sceneGlyphs.length : words;
        for (let c = glyphs[o + 7]!; c < glyphs[o + 7]! + glyphs[o + 8]!; c++) units.set(c, unit);
        if (src.unit === 'glyph')
          sceneGlyphs.push([
            sceneLines.length,
            b,
            round3(from + (k * qw) / run.length),
            round3(qw / run.length),
          ]);
      });
      words++;
      return [from, qw, h];
    });
    sceneLines.push({ y: round2((base - ascent) / em), base: round2(base / em), boxes });
  }
  const scene: Scene = {
    v: 1,
    page: {
      w: round2(src.box.width / em),
      h: round2(src.box.height / em),
      columns: src.columns,
      gutter: round2(src.gutter / em),
      font: src.font,
      size: 1,
    },
    lines: sceneLines,
    ...(src.unit === 'glyph' ? { glyphs: sceneGlyphs } : {}),
    passage: {
      start: src.passage.start,
      end: src.passage.end,
      boxes: passage[0] < 0 ? [0, 0] : passage,
    },
    seed: src.seed,
    step_hz: STEP_HZ,
    events,
    checkpoints: [],
    sfx,
    cover_step: 0,
  };
  return { scene, unitOf: (canon) => units.get(canon) ?? -1 };
};

export const packScene = (scene: Scene): Uint8Array | null => {
  const boxes = scene.lines.reduce((n, l) => n + l.boxes.length, 0);
  if (boxes > MAX_BOXES || (scene.glyphs?.length ?? 0) > MAX_BOXES) return null;
  const raw = strToU8(JSON.stringify(scene));
  if (raw.length > SCENE_RAW_MAX) return null;
  const packed = gzipSync(raw);
  return packed.length > SCENE_GZIP_MAX ? null : packed;
};

export const unpackScene = (bytes: Uint8Array): Scene | null => {
  if (bytes.length > SCENE_GZIP_MAX) return null;
  try {
    const raw = gunzipSync(bytes);
    return raw.length > SCENE_RAW_MAX ? null : (JSON.parse(strFromU8(raw)) as Scene);
  } catch {
    return null;
  }
};

const allowed = (path: string, v: string) =>
  (path === '/page/font' && FACES.includes(v)) || (SFX_PATH.test(path) && SFX_ID.test(v));

export const stringsOutsideAllowList = (value: unknown, path = ''): string[] => {
  if (typeof value === 'string') return allowed(path, value) ? [] : [path];
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([k, v]) =>
    stringsOutsideAllowList(v, `${path}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`),
  );
};
