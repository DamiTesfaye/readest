import { describe, expect, it } from 'vitest';
import { byteAt, scalarAt } from '@/services/margins/public/offsets';

const bytes = new TextEncoder().encode('aé𝔄b');

describe('scalar offsets', () => {
  it('counts scalars before a byte offset', () => {
    expect(scalarAt(bytes, 0)).toBe(0);
    expect(scalarAt(bytes, 3)).toBe(2);
    expect(scalarAt(bytes, 7)).toBe(3);
    expect(scalarAt(bytes, 8)).toBe(4);
  });

  it('finds the byte offset of a scalar index', () => {
    expect(byteAt(bytes, 0)).toBe(0);
    expect(byteAt(bytes, 3)).toBe(7);
    expect(byteAt(bytes, 4)).toBe(8);
  });

  it('round-trips every scalar index', () => {
    for (let s = 0; s <= 4; s++) expect(scalarAt(bytes, byteAt(bytes, s))).toBe(s);
  });
});
