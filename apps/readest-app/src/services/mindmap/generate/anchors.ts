import { type BookDoc, CFI, type SectionFragment, type TOCItem } from '@/libs/document';
import type { RecordAnchor } from '@/services/mindmap/schema/types';
import { getIndexFromCfi } from '@/utils/cfi';

export type LocatableBook = Pick<BookDoc, 'sections' | 'splitTOCHref'>;

export interface BookLocator {
  locateToc(item: TOCItem): RecordAnchor | null;
  locateCfi(cfi: string): RecordAnchor | null;
}

export type JumpTarget = { kind: 'cfi'; cfi: string } | { kind: 'fraction'; fraction: number };

interface Located {
  href: string;
  cfi: string;
  section: number;
  offset: number;
}

const linearSize = ({ linear, size }: { linear: string; size: number }): number =>
  linear !== 'no' && size > 0 ? size : 0;

const fragmentPoints = (
  fragments: readonly SectionFragment[] | undefined,
  start: number,
  section: number,
): Located[] => {
  const points: Located[] = [];
  let offset = start;
  for (const fragment of fragments ?? []) {
    offset += fragment.size || 0;
    points.push({ href: fragment.href, cfi: fragment.cfi, section, offset });
    points.push(...fragmentPoints(fragment.fragments, offset, section));
  }
  return points;
};

const pageOfDest = (href: string): number | undefined => {
  try {
    const dest: unknown = JSON.parse(href);
    return Array.isArray(dest) && typeof dest[0] === 'number' ? dest[0] : undefined;
  } catch {
    return undefined;
  }
};

const compareCfi = (a: string, b: string): number => {
  try {
    return CFI.compare(a, b);
  } catch {
    return 1;
  }
};

export const createBookLocator = (book: LocatableBook): BookLocator => {
  const sizes = book.sections.map(linearSize);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const starts = sizes.map((_, index) => sizes.slice(0, index).reduce((sum, s) => sum + s, 0));
  const bySection = book.sections.map((section, index) => [
    {
      href: String(section.id),
      cfi: section.cfi || CFI.fake.fromIndex(index),
      section: index,
      offset: starts[index]!,
    },
    ...fragmentPoints(section.fragments, starts[index]!, index),
  ]);
  const byHref = new Map<string, Located>();
  for (const point of bySection.flat()) if (point.href) byHref.set(point.href, point);

  const progressOf = (point: Located): number => {
    const fraction = total > 0 ? point.offset / total : point.section / book.sections.length;
    return Math.min(1, Math.max(0, fraction));
  };

  const toAnchor = (point: Located, cfi = point.cfi): RecordAnchor => ({
    cfi,
    section: point.section,
    progress: progressOf(point),
  });

  const headOf = (href: string): unknown => {
    try {
      const parts: unknown = book.splitTOCHref(href);
      if (Array.isArray(parts)) return parts[0];
      void Promise.resolve(parts).catch(() => undefined);
    } catch {
      return null;
    }
    return null;
  };

  const sectionStart = (index: unknown): Located | null =>
    typeof index === 'number' && Number.isInteger(index) ? (bySection[index]?.[0] ?? null) : null;

  const locateHref = (href: string): Located | null => {
    if (!href) return null;
    const exact = byHref.get(href);
    if (exact) return exact;
    const head = headOf(href);
    if (typeof head === 'number') return sectionStart(head);
    return typeof head === 'string' ? (byHref.get(head) ?? null) : null;
  };

  return {
    locateToc: (item) => {
      const point = locateHref(item.href) ?? sectionStart(item.index ?? pageOfDest(item.href));
      return point ? toAnchor(point) : null;
    },
    locateCfi: (cfi) => {
      const index = getIndexFromCfi(cfi);
      const points = index === null ? undefined : bySection[index];
      if (!points) return null;
      const point = points
        .filter((candidate) => compareCfi(candidate.cfi, cfi) <= 0)
        .reduce(
          (best, candidate) => (candidate.offset > best.offset ? candidate : best),
          points[0]!,
        );
      return toAnchor(point, cfi);
    },
  };
};

export const resolveJumpTarget = (
  anchor: RecordAnchor,
  sectionCount: number,
  resolvesCfi: (cfi: string) => boolean,
): JumpTarget | null => {
  if (resolvesCfi(anchor.cfi)) return { kind: 'cfi', cfi: anchor.cfi };
  if (anchor.section < sectionCount) return { kind: 'fraction', fraction: anchor.progress };
  return null;
};
