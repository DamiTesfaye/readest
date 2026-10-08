import { describe, expect, it } from 'vitest';

import type { Book } from '@/types/book';
import { getProgressPercentage } from '@/utils/bookProgress';

const makeBook = (overrides: Partial<Book> = {}): Book =>
  ({
    hash: 'h1',
    format: 'EPUB',
    title: 'Zero to One',
    author: 'Peter Thiel',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }) as Book;

describe('getProgressPercentage', () => {
  it('returns null when there is no progress', () => {
    expect(getProgressPercentage(makeBook())).toBeNull();
  });

  it('returns null when the total is zero', () => {
    expect(getProgressPercentage(makeBook({ progress: [3, 0] }))).toBeNull();
  });

  it('treats a single-page total as complete', () => {
    expect(getProgressPercentage(makeBook({ progress: [1, 1] }))).toBe(100);
  });

  it('rounds to a whole percent', () => {
    expect(getProgressPercentage(makeBook({ progress: [6, 100] }))).toBe(6);
    expect(getProgressPercentage(makeBook({ progress: [1, 24] }))).toBe(4);
  });

  it('clamps out-of-range progress', () => {
    expect(getProgressPercentage(makeBook({ progress: [-5, 100] }))).toBe(0);
    expect(getProgressPercentage(makeBook({ progress: [150, 100] }))).toBe(100);
  });
});
