import { describe, expect, it } from 'vitest';

import type { BookNote } from '@/types/book';
import type { TOCItem } from '@/libs/document';
import { selectBooknoteEntries } from '@/app/reader/components/booknotes/selectors';

const makeNote = (overrides: Partial<BookNote>): BookNote =>
  ({
    id: 'id',
    type: 'annotation',
    cfi: 'epubcfi(/6/4!/4/2)',
    note: '',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }) as BookNote;

const toc = [
  { id: 0, label: 'VI. The Shoemaker', href: 'ch6.xhtml', cfi: 'epubcfi(/6/4!/4/2)' },
  { id: 1, label: '2. The Rowboat', href: 'ch7.xhtml', cfi: 'epubcfi(/6/6!/4/2)' },
] as TOCItem[];

describe('selectBooknoteEntries', () => {
  it('interleaves bookmarks and notes in reading order', () => {
    const entries = selectBooknoteEntries(
      [
        makeNote({ id: 'later-bookmark', type: 'bookmark', cfi: 'epubcfi(/6/6!/4/2)' }),
        makeNote({ id: 'note', cfi: 'epubcfi(/6/4!/4/6)', text: 'You would have spoken' }),
        makeNote({ id: 'first-bookmark', type: 'bookmark', cfi: 'epubcfi(/6/4!/4/2)' }),
      ],
      toc,
    );

    expect(entries.map((entry) => entry.id)).toEqual(['first-bookmark', 'note', 'later-bookmark']);
    expect(entries.map((entry) => entry.kind)).toEqual(['bookmark', 'note', 'bookmark']);
  });

  it('labels a bookmark with its chapter when it carries no text of its own', () => {
    const [entry] = selectBooknoteEntries(
      [makeNote({ id: 'b', type: 'bookmark', cfi: 'epubcfi(/6/6!/4/2)' })],
      toc,
    );

    expect(entry).toMatchObject({ kind: 'bookmark', label: '2. The Rowboat' });
  });

  it('titles a bookmark by chapter rather than the page snippet it stores', () => {
    const [entry] = selectBooknoteEntries(
      [
        makeNote({
          id: 'b',
          type: 'bookmark',
          cfi: 'epubcfi(/6/6!/4/2)',
          text: 'The result and phenomenon of increased',
        }),
      ],
      toc,
    );

    expect(entry).toMatchObject({ kind: 'bookmark', label: '2. The Rowboat' });
  });

  it('falls back to the stored snippet when no chapter matches', () => {
    const [entry] = selectBooknoteEntries(
      [makeNote({ id: 'b', type: 'bookmark', cfi: 'epubcfi(/6/6!/4/2)', text: '101' })],
      [],
    );

    expect(entry).toMatchObject({ kind: 'bookmark', label: '101' });
  });

  it('drops deleted notes and excerpts', () => {
    const entries = selectBooknoteEntries(
      [
        makeNote({ id: 'gone', deletedAt: 1 }),
        makeNote({ id: 'excerpt', type: 'excerpt' }),
        makeNote({ id: 'kept' }),
      ],
      toc,
    );

    expect(entries.map((entry) => entry.id)).toEqual(['kept']);
  });

  it('leaves the order of the array it was given alone', () => {
    const booknotes = [
      makeNote({ id: 'b', cfi: 'epubcfi(/6/6!/4/2)' }),
      makeNote({ id: 'a', cfi: 'epubcfi(/6/4!/4/2)' }),
    ];

    selectBooknoteEntries(booknotes, toc);

    expect(booknotes.map((note) => note.id)).toEqual(['b', 'a']);
  });
});
