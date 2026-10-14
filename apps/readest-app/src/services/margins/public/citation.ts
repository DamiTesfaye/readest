import type { Citation } from './api';

type CitationBook = { title: string | null; author: string | null } | null;

const edition = (c: Partial<Citation>) => {
  if (c.publisher && c.year) return `${c.publisher}, ${c.year} ed.`;
  if (c.publisher) return c.publisher;
  return c.year ? `${c.year} ed.` : null;
};

export const formatCitation = (
  citation: Citation | Record<string, never> | null | undefined,
  book: CitationBook,
): string => {
  const c: Partial<Citation> = citation ?? {};
  const where =
    c.page || c.chapter
      ? [c.page ? `p. ${c.page}` : null, c.chapter ?? null]
      : [c.percent === undefined ? null : `${c.percent}%`];
  return [book?.title ?? null, book?.author ?? null, edition(c), ...where]
    .filter((part): part is string => !!part)
    .join(' · ');
};
