import { describe, expect, it, vi } from 'vitest';
import type { PlayElement } from '@/services/margins/play/element';
import { keepPlay, keepSpan } from '@/services/margins/play/keep';
import type { Anchor } from '@/services/margins/types';

const canonical = new TextEncoder().encode('x'.repeat(5000));

const anchor = { quote: { exact: 'x'.repeat(40) } } as Anchor;
const element = (shapeId = 's1'): PlayElement => ({
  id: 'p1',
  kind: 'play',
  frame: { x: 0.5, y: 0.6, w: 0.8, r: 0 },
  contract: 'displace',
  alt: 'A sun',
  shapes: [{ id: shapeId, type: 'circle', r: 3, pad: 0.4 }],
  poses: [{ shape: shapeId, x: 1, y: 1, rot: 0 }],
});

const deps = (over: boolean, el = element()) => ({
  fileHash: 'hash-a',
  createAnchor: vi.fn(async () => anchor),
  overQuota: vi.fn(async () => over),
  element: el,
  save: vi.fn(async () => 'lyr_1'),
});

describe('keep span', () => {
  it('is the shortest span covering detached spans and shape lines', () => {
    expect(keepSpan({ detached: [[100, 120]], shapeLines: [[40, 90]], canonical })).toEqual({
      start: 40,
      end: 120,
      dropped: 0,
    });
  });

  it('caps at 3,000 scalars and drops spans outside', () => {
    expect(
      keepSpan({
        detached: [
          [10, 20],
          [3500, 3510],
        ],
        shapeLines: [],
        canonical,
      }),
    ).toEqual({ start: 10, end: 20, dropped: 1 });
  });

  it('is null with nothing to keep', () => {
    expect(keepSpan({ detached: [], shapeLines: [], canonical })).toBeNull();
  });

  it('is null when the only span is longer than the cap', () => {
    expect(keepSpan({ detached: [[10, 3500]], shapeLines: [], canonical })).toBeNull();
  });
});

describe('keep', () => {
  it('saves a play Margin in B envelope', async () => {
    const d = deps(false);
    expect(await keepPlay(d)).toEqual({ ok: true, layerId: 'lyr_1' });
    expect(d.save).toHaveBeenCalledWith({
      fileHash: 'hash-a',
      anchor,
      envelope: expect.objectContaining({ v: 1, ground: 'paper', elements: [element()] }),
    });
  });

  it('refuses over the quota and over 16 KiB without saving', async () => {
    const quota = deps(true);
    expect(await keepPlay(quota)).toEqual({ ok: false, reason: 'quota' });
    const huge = deps(false, element('s'.repeat(17_000)));
    expect(await keepPlay(huge)).toEqual({ ok: false, reason: 'size' });
    expect(quota.save).not.toHaveBeenCalled();
    expect(huge.save).not.toHaveBeenCalled();
  });
});
