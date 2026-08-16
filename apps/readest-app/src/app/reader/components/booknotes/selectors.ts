import * as CFI from 'foliate-js/epubcfi.js';

import type { BookNote } from '@/types/book';
import type { TOCItem } from '@/libs/document';
import { findTocItemBS } from '@/services/nav';

export type BooknoteEntry =
  | { kind: 'bookmark'; id: string; item: BookNote; label: string }
  | { kind: 'note'; id: string; item: BookNote };

const isListed = (note: BookNote) =>
  !note.deletedAt && (note.type === 'bookmark' || (note.type === 'annotation' && !!note.note));

export const selectAnnotationEntries = (booknotes: BookNote[]): BookNote[] =>
  booknotes
    .filter((note) => !note.deletedAt && note.type === 'annotation')
    .slice()
    .sort((a, b) => CFI.compare(a.cfi, b.cfi));

export const selectBooknoteEntries = (booknotes: BookNote[], toc: TOCItem[]): BooknoteEntry[] =>
  booknotes
    .filter(isListed)
    .slice()
    .sort((a, b) => CFI.compare(a.cfi, b.cfi))
    .map((item) =>
      item.type === 'bookmark'
        ? {
            kind: 'bookmark' as const,
            id: item.id,
            item,
            label: findTocItemBS(toc, item.cfi)?.label || item.text || '',
          }
        : { kind: 'note' as const, id: item.id, item },
    );
