import { describe, expect, it } from 'vitest';
import { compareByIndex, isValidOrderKey, keyBetween } from '@/services/mindmap/order/keyBetween';

describe('keyBetween', () => {
  it('returns the shortest keys for the first, next and previous positions', () => {
    expect(keyBetween(null, null)).toBe('a0');
    expect(keyBetween('a0', null)).toBe('a1');
    expect(keyBetween(null, 'a0')).toBe('Zz');
    expect(keyBetween('az', null)).toBe('b00');
  });

  it('bisects between two keys', () => {
    expect(keyBetween('a0', 'a1')).toBe('a0V');
    expect(keyBetween('a0', 'a0V')).toBe('a0G');
    expect(keyBetween('a0V', 'a1')).toBe('a0l');
    expect(keyBetween('a0', 'a01')).toBe('a00V');
  });

  it('throws on bad bounds instead of looping', () => {
    expect(() => keyBetween('a1', 'a0')).toThrow(RangeError);
    expect(() => keyBetween('a0', 'a0')).toThrow(RangeError);
    expect(() => keyBetween('i', 'i0')).toThrow(RangeError);
    expect(() => keyBetween(null, '0')).toThrow(RangeError);
    expect(() => keyBetween('a00', null)).toThrow(RangeError);
  });

  it('keeps 1000 appended keys ordered and at most three characters long', () => {
    let last: string | null = null;
    const keys: string[] = [];
    for (let i = 0; i < 1000; i += 1) {
      const key = keyBetween(last, null);
      keys.push(key);
      last = key;
    }
    expect([...keys].sort()).toEqual(keys);
    expect(Math.max(...keys.map((key) => key.length))).toBe(3);
    expect(keys.every(isValidOrderKey)).toBe(true);
  });

  it('keeps 1000 prepended keys ordered and at most three characters long', () => {
    let first: string | null = null;
    const keys: string[] = [];
    for (let i = 0; i < 1000; i += 1) {
      const key = keyBetween(null, first);
      keys.push(key);
      first = key;
    }
    expect([...keys].sort()).toEqual([...keys].reverse());
    expect(Math.max(...keys.map((key) => key.length))).toBe(3);
  });

  it('stays valid and short when inserting into the same gap 50 times', () => {
    let upper = 'a1';
    for (let i = 0; i < 50; i += 1) {
      const key = keyBetween('a0', upper);
      expect(key > 'a0' && key < upper).toBe(true);
      expect(isValidOrderKey(key)).toBe(true);
      upper = key;
    }
    expect(upper.length).toBeLessThanOrEqual(12);

    let lower = 'a0';
    for (let i = 0; i < 50; i += 1) {
      const key = keyBetween(lower, 'a1');
      expect(key > lower && key < 'a1').toBe(true);
      expect(isValidOrderKey(key)).toBe(true);
      lower = key;
    }
    expect(lower.length).toBeLessThanOrEqual(12);
  });
});

describe('isValidOrderKey', () => {
  it('never returns the smallest integer when prepending just above it', () => {
    const b = `A${'0'.repeat(25)}1`;
    const key = keyBetween(null, b);
    expect(isValidOrderKey(key)).toBe(true);
    expect(key < b).toBe(true);
  });

  it('accepts well-formed keys and rejects malformed ones', () => {
    expect(['a0', 'Zz', 'a0V', 'b00'].every(isValidOrderKey)).toBe(true);
    expect(['', 'i', 'a00', 'a0-', '0', `A${'0'.repeat(26)}`].some(isValidOrderKey)).toBe(false);
  });
});

describe('compareByIndex', () => {
  it('orders equal keys from two devices by id', () => {
    const records = [
      { id: 'dev-b', index: 'a0' },
      { id: 'dev-a', index: 'a0' },
      { id: 'x', index: 'Zz' },
    ];
    expect([...records].sort(compareByIndex).map((record) => record.id)).toEqual([
      'x',
      'dev-a',
      'dev-b',
    ]);
  });
});
