import { describe, expect, it, vi } from 'vitest';
import type { MarginsCore } from '@/services/margins/marginsClient';
import type { PostView } from '@/services/margins/public/api';
import { ghostGlyph } from '@/services/margins/replay/ghost';
import {
  chooseMaterial,
  drawUnits,
  ownerPassage,
  passageUnits,
  unitsOf,
} from '@/services/margins/replay/material';
import type { Scene } from '@/services/margins/replay/types';
import type { MarginsStore } from '@/services/margins/store';

const scene: Scene = {
  v: 1,
  page: { w: 20, h: 30, columns: 1, gutter: 0, font: 'SourceSerif4-Regular', size: 1 },
  lines: [
    {
      y: 0,
      base: 1,
      boxes: [
        [0, 1, 1.4],
        [1.5, 1, 1.4],
        [3, 1, 1.4],
      ],
    },
    { y: 1.5, base: 2.5, boxes: [[0, 2, 1.4]] },
  ],
  passage: { start: 0, end: 5, boxes: [0, 3] },
  seed: 7,
  step_hz: 120,
  events: [],
  checkpoints: [],
  sfx: [],
  cover_step: 0,
};

const glyphScene: Scene = {
  ...scene,
  glyphs: [
    [0, 0, 0, 0.5],
    [0, 0, 0.5, 0.5],
    [0, 1, 1.5, 1],
    [0, 2, 3, 1],
    [1, 0, 0, 1],
    [1, 0, 1, 1],
  ],
};

const post = {
  textId: 'txt_1',
  section: 2,
  sectionLen: 36,
  start: 0,
  end: 19,
  book: { title: null, author: null, workId: null, capped: true },
} as PostView;

const store = {
  getText: async () => ({ familyId: 'fam_1' }),
  getTextLink: async (hash: string) =>
    hash === 'h1' ? { textId: 'txt_1', familyId: 'fam_1' } : null,
  getTextMap: async () => [{}, {}, {}],
} as unknown as MarginsStore;

const core = {
  loadBook: async () => undefined,
  sectionLengths: async () => [10, 20, 36],
  canonicalSection: async () => ({ text: 'Alice was beginning to get very tired' }),
} as unknown as MarginsCore;

const mockContext = () => ({
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  rotate: vi.fn(),
  scale: vi.fn(),
  beginPath: vi.fn(),
  roundRect: vi.fn(),
  fill: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 32 })),
  fillStyle: '',
  font: '',
});

const asContext = (g: ReturnType<typeof mockContext>) => g as unknown as CanvasRenderingContext2D;

const boxesFor = (n: number) =>
  Float32Array.from(Array.from({ length: n }, (_, i) => [i * 1.5, 1, 1, 0, 1]).flat());

describe('replay material', () => {
  it('an owner gets their own text', () => {
    const m = chooseMaterial({ scene, display: 'shape', quote: null, owner: 'a b c' });
    expect(m).toEqual({ kind: 'owner', cells: ['a', 'b', 'c'] });
  });

  it('an edition mismatch drops to the quote, then to ghost glyphs', () => {
    expect(chooseMaterial({ scene, display: 'quote', quote: 'x y z', owner: 'a b' }).kind).toBe(
      'quote',
    );
    expect(chooseMaterial({ scene, display: 'quote', quote: 'x y', owner: 'a b' }).kind).toBe(
      'ghost',
    );
  });

  it('a shape post never draws its quote', () => {
    expect(chooseMaterial({ scene, display: 'shape', quote: 'x y z', owner: null }).kind).toBe(
      'ghost',
    );
  });

  it('a glyph scene takes the passage as code points', () => {
    expect(passageUnits(glyphScene)).toEqual([0, 4]);
    expect(
      chooseMaterial({ scene: glyphScene, display: 'quote', quote: 'Ab c d', owner: null }),
    ).toEqual({ kind: 'quote', cells: ['A', 'b', 'c', 'd'] });
  });

  it('ghost glyphs receive no text', () => {
    const g = mockContext();
    const units = unitsOf(scene);
    drawUnits(asContext(g), {
      boxes: boxesFor(units.length),
      units,
      material: { kind: 'ghost' },
      passage: [0, 3],
      seed: 7,
      em: 16,
      color: '#000',
      font: 'serif',
    });
    expect(g.fillText).not.toHaveBeenCalled();
    expect(g.fill).toHaveBeenCalled();
    expect(ghostGlyph(7, 2, 3, 1.4)).toEqual(ghostGlyph(7, 2, 3, 1.4));
  });

  it('draws only the material cells as text and fits them to their box', () => {
    const g = mockContext();
    const units = unitsOf(scene);
    drawUnits(asContext(g), {
      boxes: boxesFor(units.length),
      units,
      material: { kind: 'owner', cells: ['a', 'b', 'c'] },
      passage: [0, 3],
      seed: 7,
      em: 16,
      color: '#000',
      font: 'serif',
    });
    expect(g.fillText.mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'c']);
    expect(g.scale).toHaveBeenCalledWith(0.5, 1);
  });

  it('skips hidden units', () => {
    const g = mockContext();
    const units = unitsOf(scene);
    drawUnits(asContext(g), {
      boxes: new Float32Array(units.length * 5),
      units,
      material: { kind: 'owner', cells: ['a', 'b', 'c'] },
      passage: [0, 3],
      seed: 7,
      em: 16,
      color: '#000',
      font: 'serif',
    });
    expect(g.fillText).not.toHaveBeenCalled();
    expect(g.fill).not.toHaveBeenCalled();
  });

  it('reads the owner passage only when the section length matches', async () => {
    expect(
      await ownerPassage({
        post: { ...post, sectionLen: 999 },
        store,
        core,
        libraryHashes: ['h1'],
      }),
    ).toBeNull();
    expect(await ownerPassage({ post, store, core, libraryHashes: ['h2'] })).toBeNull();
    expect(await ownerPassage({ post, store, core, libraryHashes: ['h1'] })).toBe(
      'Alice was beginning',
    );
  });
});
