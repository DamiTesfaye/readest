import { describe, expect, it } from 'vitest';
import { coreMethods } from '../../../../public/workers/margins-core-methods.js';

describe('coreMethods', () => {
  it('measures each canonical section in scalars', () => {
    const methods = coreMethods({
      canonical_section: (_h: string, i: number) =>
        JSON.stringify({ text: ['ab\u{1D504}', ''][i], runs: [] }),
      scalar_len: (s: string) => [...s].length,
    });
    expect(methods.sectionLengths('h', 2)).toEqual([3, 0]);
  });
});
