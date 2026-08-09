import type { Book } from '@/types/book';

export const getProgressPercentage = (book: Book): number | null => {
  if (!book.progress || !book.progress[1]) {
    return null;
  }
  if (book.progress[1] === 1) {
    return 100;
  }
  const percentage = Math.round((book.progress[0] / book.progress[1]) * 100);
  return Math.max(0, Math.min(100, percentage));
};
