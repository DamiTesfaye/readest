import { describe, expect, it } from 'vitest';
import {
  buildScene,
  CHECKPOINT_EVERY,
  EV,
  MAX_EVENTS,
  packScene,
  SCENE_GZIP_MAX,
  stringsOutsideAllowList,
  TOOL,
  unpackScene,
  type SceneSource,
} from '@/services/margins/replay/scene';
import { replayCtor } from './nodeReplay';

const EM = 16;
const ADV = 8;

const frame = (lineTexts: string[], start = 0) => {
  const glyphs: number[] = [];
  const lines: number[] = [];
  let canon = start;
  lineTexts.forEach((t, l) => {
    const base = 30 + l * 24;
    lines.push(0, 0, base, 17.6, 4.8, glyphs.length / 10, t.length);
    [...t].forEach((_, i) => {
      glyphs.push(i * ADV, base, ADV, EM, 1, 0, 1, canon, 1, 1);
      canon += 1;
    });
  });
  return { glyphs: Float32Array.from(glyphs), lines: Float32Array.from(lines) };
};

const sourceOf = (lineTexts: string[]): SceneSource => ({
  ...frame(lineTexts),
  text: new TextEncoder().encode(lineTexts.join('')),
  windowStart: 0,
  em: EM,
  box: { width: 440, height: 640 },
  columns: 1,
  gutter: 0,
  font: 'SourceSerif4-Regular',
  unit: 'word',
  passage: { startByte: 0, endByte: 0, start: 0, end: 0 },
  seed: 7,
});

const source = sourceOf(['Begin the morning ', 'by saying']);

const fullPage = (n: number) => {
  const per = Math.ceil(n / 40);
  const lineTexts = Array.from({ length: 40 }, (_, l) =>
    'a '.repeat(Math.max(0, Math.min(per, n - l * per))),
  );
  return sourceOf(lineTexts);
};

describe('scene builder', () => {
  it('groups glyphs into word boxes in em and keeps no text', () => {
    const { scene } = buildScene(source, []);
    expect(scene.lines.map((l) => l.boxes.length)).toEqual([3, 2]);
    expect(scene.lines[0]!.boxes[0]).toEqual([0, 5 * 0.5, 1.4]);
    expect(stringsOutsideAllowList(scene)).toEqual([]);
    expect(JSON.stringify(scene)).not.toMatch(/Begin|morning|saying/);
  });

  it('keeps the recorded sounds and only allowed strings', () => {
    const { scene } = buildScene(source, [], [[180, 'pop-1']]);
    expect(scene.sfx).toEqual([[180, 'pop-1']]);
    expect(stringsOutsideAllowList(scene)).toEqual([]);
  });

  it('names the passage boxes', () => {
    expect(
      buildScene({ ...source, passage: { startByte: 6, endByte: 17, start: 6, end: 17 } }, []).scene
        .passage.boxes,
    ).toEqual([1, 3]);
  });

  it('maps a canonical byte to its unit', () => {
    const { unitOf } = buildScene(source, []);
    expect(unitOf(10)).toBe(2);
    expect(unitOf(5)).toBe(-1);
  });

  it('adds glyph units for the glyph detach unit', () => {
    expect(buildScene({ ...source, unit: 'glyph' }, []).scene.glyphs).toHaveLength(23);
  });

  it('a glyph scene stores equal glyph widths per word', () => {
    const { scene } = buildScene({ ...source, unit: 'glyph' }, []);
    const [x, w] = scene.lines[0]!.boxes[0]!;
    const word = scene.glyphs!.filter((g) => g[0] === 0 && g[1] === 0);
    expect(word).toHaveLength(5);
    word.forEach((g, k) => {
      expect(g[3]).toBeCloseTo(w / word.length, 2);
      expect(g[2]).toBeCloseTo(x + (k * w) / word.length, 2);
    });
  });

  it('quantises word boxes to 0.25 em', () => {
    const odd = sourceOf(['Begin the morning ', 'by saying']);
    odd.glyphs = odd.glyphs.map((v, i) => (i % 10 === 0 ? v * 1.13 + 0.7 : v));
    for (const s of [source, odd]) {
      const { scene } = buildScene(s, []);
      for (const l of scene.lines)
        for (const [x, w] of l.boxes) {
          expect(Math.abs(x / 0.25 - Math.round(x / 0.25))).toBeLessThan(0.02);
          expect(w).toBeGreaterThanOrEqual(0.25);
          expect(Math.abs(w / 0.25 - Math.round(w / 0.25))).toBeLessThan(0.02);
        }
    }
  });

  it('builds scenes the replay engine accepts', async () => {
    const Replay = await replayCtor();
    const odd = sourceOf(['Begin the morning ', 'by saying']);
    odd.glyphs = odd.glyphs.map((v, i) => (i % 10 === 0 ? v * 1.13 + 0.7 : v));
    const passage = { startByte: 6, endByte: 17, start: 6, end: 17 };
    for (const s of [source, odd, { ...odd, unit: 'glyph' as const }]) {
      const events = [[0, EV.TOOL, TOOL.DETACH, 0, 1]];
      new Replay(JSON.stringify(buildScene({ ...s, passage }, events).scene)).free();
    }
  });

  it('round-trips through gzip', () => {
    const { scene } = buildScene(source, [[0, EV.TOOL, TOOL.DETACH, 0, 1]]);
    expect(unpackScene(packScene(scene)!)).toEqual(scene);
  });

  it('refuses garbage when unpacking', () => {
    expect(unpackScene(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('a full page with a full log stays under the scene caps', () => {
    const big = fullPage(2000);
    const events = Array.from({ length: MAX_EVENTS }, (_, i) =>
      [Math.floor(i / 3), EV.MOVE, (i % 997) / 7, (i % 89) / 3].map((v, k) =>
        k > 1 ? Math.round(v * 100) / 100 : v,
      ),
    );
    const pose = (k: number) =>
      Array.from({ length: 3 * 8 + 4 * 600 }, (_, i) => (i * 7919 + k * 104729) % 4001);
    const checkpoints = Array.from(
      { length: 12 },
      (_, k) => [(k + 1) * CHECKPOINT_EVERY, 2 ** 52 + k, pose(k)] as [number, number, number[]],
    );
    const built = buildScene(big, events).scene;
    expect(built.lines.reduce((n, l) => n + l.boxes.length, 0)).toBe(2000);
    const packed = packScene({ ...built, checkpoints });
    expect(packed).not.toBeNull();
    expect(packed!.length).toBeLessThanOrEqual(SCENE_GZIP_MAX);
  });

  it('answers null over the box cap', () => {
    expect(packScene(buildScene(fullPage(2001), []).scene)).toBeNull();
  });

  it('finds a string anywhere but the font and sfx ids', () => {
    expect(
      stringsOutsideAllowList({
        page: { font: 'SourceSerif4-Regular' },
        sfx: [[1, 'pop']],
        x: ['y'],
      }),
    ).toEqual(['/x/0']);
    expect(stringsOutsideAllowList({ page: { font: 'Begin' }, sfx: [[1, 'Pop!']] })).toEqual([
      '/page/font',
      '/sfx/0/1',
    ]);
  });
});
