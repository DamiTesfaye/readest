import { describe, expect, it } from 'vitest';
import {
  bytesToScalars,
  scalarsToBytes,
  validatePlayElement,
} from '@/services/margins/play/element';

const canonical = new TextEncoder().encode('ab\u{1D51E}c\u0301d e');
const el = (extra: object) => ({
  id: 'p1',
  kind: 'play',
  frame: { x: 0.5, y: 0.5, w: 0.6, r: 0 },
  contract: 'detach',
  alt: 'loose words',
  detach: { unit: 'glyph', spans: [[0, 2]], sink: 'floor', seed: 3 },
  ...extra,
});
const poly = (n: number) => ({ id: `p${n}`, type: 'polygon', pts: Array(n).fill([0, 0]), pad: 0 });

describe('play element', () => {
  it('converts scalar spans to canonical bytes over astral and combining characters', () => {
    expect(scalarsToBytes(canonical, 0, [[2, 4]])).toEqual([[2, 7]]);
    expect(scalarsToBytes(canonical, 0, [[2, 5]])).toEqual([[2, 9]]);
    expect(bytesToScalars(canonical, 0, [[2, 9]])).toEqual([[2, 5]]);
    expect(scalarsToBytes(canonical, 2, [[0, 1]])).toEqual([[2, 6]]);
    expect(bytesToScalars(canonical, 2, [[2, 6]])).toEqual([[0, 1]]);
  });

  it('accepts the limits and rejects one past each', () => {
    expect(validatePlayElement(el({}), 8)).toBeNull();
    expect(
      validatePlayElement(
        el({ detach: { unit: 'glyph', spans: [[7, 9]], sink: 'floor', seed: 3 } }),
        8,
      ),
    ).toBe('span');
    expect(validatePlayElement(el({ alt: 'x'.repeat(301) }), 8)).toBe('alt');
    expect(
      validatePlayElement(
        el({
          contract: 'displace',
          shapes: Array.from({ length: 17 }, (_, i) => ({
            id: `c${i}`,
            type: 'circle',
            r: 1,
            pad: 0,
          })),
        }),
        8,
      ),
    ).toBe('shapes');
    expect(validatePlayElement(el({ contract: 'displace', shapes: [poly(257)] }), 8)).toBe(
      'points',
    );
    const at = [poly(200), poly(200), poly(200), poly(200)];
    expect(validatePlayElement(el({ contract: 'displace', shapes: at }), 8)).toBeNull();
    expect(
      validatePlayElement(el({ contract: 'displace', shapes: [...at.slice(1), poly(201)] }), 8),
    ).toBe('points');
    expect(
      validatePlayElement(
        el({ contract: 'displace', shapes: [{ id: 's', type: 'asset', asset: 'ast_1' }] }),
        8,
      ),
    ).toBe('unknown');
    expect(validatePlayElement(el({ contract: 'displace' }), 8)).toBe('contract');
  });
});
