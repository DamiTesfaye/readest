import { describe, expect, it } from 'vitest';
import { ensureLibraryStatusFilter, matchesStatusFilter } from '@/app/library/utils/libraryUtils';
import type { Book } from '@/types/book';

const makeBook = (overrides: Partial<Book> = {}): Book => ({
  hash: 'h1',
  format: 'EPUB',
  title: 'T',
  author: 'A',
  createdAt: 1,
  updatedAt: 2,
  ...overrides,
});

describe('ensureLibraryStatusFilter', () => {
  it('accepts the two supported filters', () => {
    expect(ensureLibraryStatusFilter('reading')).toBe('reading');
    expect(ensureLibraryStatusFilter('finished')).toBe('finished');
  });

  it('falls back to all for anything else', () => {
    expect(ensureLibraryStatusFilter(null)).toBe('all');
    expect(ensureLibraryStatusFilter(undefined)).toBe('all');
    expect(ensureLibraryStatusFilter('')).toBe('all');
    expect(ensureLibraryStatusFilter('abandoned')).toBe('all');
  });
});

describe('matchesStatusFilter', () => {
  it('matches every book under all', () => {
    expect(matchesStatusFilter(makeBook(), 'all')).toBe(true);
    expect(matchesStatusFilter(makeBook({ readingStatus: 'finished' }), 'all')).toBe(true);
  });

  it('reading requires progress and excludes finished/abandoned books', () => {
    expect(matchesStatusFilter(makeBook({ progress: [3, 10] }), 'reading')).toBe(true);
    expect(matchesStatusFilter(makeBook(), 'reading')).toBe(false);
    expect(matchesStatusFilter(makeBook({ progress: [0, 10] }), 'reading')).toBe(false);
    expect(
      matchesStatusFilter(makeBook({ progress: [3, 10], readingStatus: 'finished' }), 'reading'),
    ).toBe(false);
    expect(
      matchesStatusFilter(makeBook({ progress: [3, 10], readingStatus: 'abandoned' }), 'reading'),
    ).toBe(false);
  });

  it('finished requires the finished reading status', () => {
    expect(matchesStatusFilter(makeBook({ readingStatus: 'finished' }), 'finished')).toBe(true);
    expect(matchesStatusFilter(makeBook({ progress: [10, 10] }), 'finished')).toBe(false);
    expect(matchesStatusFilter(makeBook({ readingStatus: 'reading' }), 'finished')).toBe(false);
  });
});
