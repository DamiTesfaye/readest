import type { Book } from '@/types/book';
import { isCurrentlyReadingBook } from '@/app/library/utils/libraryUtils';

export interface LibraryPopoverSegments {
  reading: Book[];
  others: Book[];
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export const isOpenableBook = (book: Book): boolean => !book.deletedAt && !!book.downloadedAt;

export const matchesQuery = (book: Book, query: string): boolean => {
  const needle = normalize(query.trim());
  if (!needle) return true;
  return (
    normalize(book.title ?? '').includes(needle) || normalize(book.author ?? '').includes(needle)
  );
};

export const isCurrentlyReading = (book: Book): boolean => isCurrentlyReadingBook(book);

const byUpdatedAtDesc = (a: Book, b: Book) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0);

export const selectLibraryPopoverBooks = (
  library: Book[],
  query: string,
): LibraryPopoverSegments => {
  const visible = library.filter((book) => isOpenableBook(book) && matchesQuery(book, query));
  return {
    reading: visible.filter(isCurrentlyReading).sort(byUpdatedAtDesc),
    others: visible.filter((book) => !isCurrentlyReading(book)).sort(byUpdatedAtDesc),
  };
};
