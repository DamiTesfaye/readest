import { describe, expect, it } from 'vitest';

import type { Book } from '@/types/book';
import {
  isOpenableBook,
  matchesQuery,
  selectLibraryPopoverBooks,
} from '@/app/reader/components/library/selectors';

const makeBook = (overrides: Partial<Book>): Book =>
  ({
    hash: 'h',
    format: 'EPUB',
    title: 'Untitled',
    author: 'Anonymous',
    createdAt: 0,
    updatedAt: 0,
    downloadedAt: 1,
    ...overrides,
  }) as Book;

describe('isOpenableBook', () => {
  it('rejects deleted books', () => {
    expect(isOpenableBook(makeBook({ deletedAt: 123 }))).toBe(false);
  });

  it('rejects books that are not downloaded', () => {
    expect(isOpenableBook(makeBook({ downloadedAt: null }))).toBe(false);
    expect(isOpenableBook(makeBook({ downloadedAt: undefined }))).toBe(false);
  });

  it('accepts a downloaded, undeleted book', () => {
    expect(isOpenableBook(makeBook({}))).toBe(true);
  });
});

describe('matchesQuery', () => {
  it('matches everything on an empty or whitespace query', () => {
    const book = makeBook({ title: 'Moby-Dick' });
    expect(matchesQuery(book, '')).toBe(true);
    expect(matchesQuery(book, '   ')).toBe(true);
  });

  it('matches title and author case-insensitively', () => {
    const book = makeBook({ title: 'Moby-Dick', author: 'Herman Melville' });
    expect(matchesQuery(book, 'MOBY')).toBe(true);
    expect(matchesQuery(book, 'melville')).toBe(true);
    expect(matchesQuery(book, 'tolstoy')).toBe(false);
  });

  it('folds diacritics in both the query and the book', () => {
    const book = makeBook({ title: 'Les Misérables', author: 'Victor Hugo' });
    expect(matchesQuery(book, 'miserables')).toBe(true);
    expect(matchesQuery(makeBook({ title: 'Les Miserables' }), 'misérables')).toBe(true);
  });

  it('tolerates a missing author', () => {
    expect(matchesQuery(makeBook({ title: 'Anon', author: undefined }), 'anon')).toBe(true);
  });
});

describe('selectLibraryPopoverBooks', () => {
  const reading1 = makeBook({
    hash: 'r1',
    title: 'Zero to One',
    readingStatus: 'reading',
    updatedAt: 10,
  });
  const reading2 = makeBook({
    hash: 'r2',
    title: 'A Tale of Two Cities',
    readingStatus: 'reading',
    updatedAt: 30,
  });
  const unread = makeBook({
    hash: 'o1',
    title: 'Moby-Dick',
    readingStatus: 'unread',
    updatedAt: 20,
  });
  const finished = makeBook({
    hash: 'o2',
    title: 'The Art of War',
    readingStatus: 'finished',
    updatedAt: 40,
  });
  const abandoned = makeBook({
    hash: 'o3',
    title: 'Ulysses',
    readingStatus: 'abandoned',
    updatedAt: 5,
  });
  const statusless = makeBook({ hash: 'o4', title: 'Pride and Prejudice', updatedAt: 1 });
  const deleted = makeBook({
    hash: 'd1',
    title: 'Deleted',
    readingStatus: 'reading',
    deletedAt: 1,
  });
  const remote = makeBook({ hash: 'n1', title: 'Not downloaded', downloadedAt: null });

  const library = [reading1, reading2, unread, finished, abandoned, statusless, deleted, remote];

  it("puts only readingStatus 'reading' in the first segment", () => {
    const { reading, others } = selectLibraryPopoverBooks(library, '');
    expect(reading.map((b) => b.hash)).toEqual(['r2', 'r1']);
    expect(others.map((b) => b.hash)).toEqual(['o2', 'o1', 'o3', 'o4']);
  });

  it('excludes deleted and not-downloaded books from both segments', () => {
    const { reading, others } = selectLibraryPopoverBooks(library, '');
    const hashes = [...reading, ...others].map((b) => b.hash);
    expect(hashes).not.toContain('d1');
    expect(hashes).not.toContain('n1');
  });

  it('orders each segment by updatedAt, newest first', () => {
    const { reading, others } = selectLibraryPopoverBooks(library, '');
    expect(reading.map((b) => b.updatedAt)).toEqual([30, 10]);
    expect(others.map((b) => b.updatedAt)).toEqual([40, 20, 5, 1]);
  });

  it('applies the query to both segments', () => {
    const { reading, others } = selectLibraryPopoverBooks(library, 'zero');
    expect(reading.map((b) => b.hash)).toEqual(['r1']);
    expect(others).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input = [...library];
    selectLibraryPopoverBooks(input, '');
    expect(input.map((b) => b.hash)).toEqual(library.map((b) => b.hash));
  });
});
