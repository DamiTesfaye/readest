import type { Book } from '@/types/book';

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

const byUpdatedAtDesc = (a: Book, b: Book) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0);

export const selectLibraryPopoverBooks = (
  library: Book[],
  query: string,
): LibraryPopoverSegments => {
  const visible = library.filter((book) => isOpenableBook(book) && matchesQuery(book, query));
  return {
    reading: visible.filter((book) => book.readingStatus === 'reading').sort(byUpdatedAtDesc),
    others: visible.filter((book) => book.readingStatus !== 'reading').sort(byUpdatedAtDesc),
  };
};
