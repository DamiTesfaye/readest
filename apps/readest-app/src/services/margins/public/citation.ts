import { canDownloadEdition, getWorkDetail } from '@/services/ampleread';
import type { WorkDetail } from '@/services/ampleread/types';
import { useLibraryStore } from '@/store/libraryStore';
import { useReaderStore } from '@/store/readerStore';
import { getMarginsCore } from '../marginsClient';
import type { LayerRow, MarginText, MarginsStore } from '../store';
import type { Citation } from './api';
import type { ScalarSpan } from './offsets';

type CitationBook = { title: string | null; author: string | null } | null;

const PUBLISHER_MAX = 100;
const PAGE_MAX = 20;
const CHAPTER_MAX = 120;

const cut = (s: string | null | undefined, n: number) =>
  s ? [...s.trim()].slice(0, n).join('') || undefined : undefined;

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

export const anchorPercent = (lengths: number[], section: number, start: number): number => {
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  const before = lengths.slice(0, section).reduce((a, b) => a + b, 0);
  return Math.min(100, Math.max(0, Math.round((100 * (before + start)) / total)));
};

export const buildCitation = (a: {
  text: MarginText | null;
  work: WorkDetail | null;
  percent: number;
  page?: string | null;
  chapter?: string | null;
}): Citation => {
  const fields = {
    publisher: cut(a.work?.editions.find(canDownloadEdition)?.sourceName, PUBLISHER_MAX),
    page: cut(a.page, PAGE_MAX),
    chapter: cut(a.chapter, CHAPTER_MAX),
  };
  return {
    ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
    percent: a.percent,
  };
};

export const readerContext = (
  fileHash: string,
  section: number,
): { page: string | null; chapter: string | null } => {
  const reader = useReaderStore.getState();
  const progress = reader.bookKeys
    .filter((key) => key.split('-')[0] === fileHash)
    .map((key) => reader.getProgress(key))
    .find((p) => p?.index === section);
  return {
    page: progress?.pageItem?.label || null,
    chapter: progress?.sectionLabel || null,
  };
};

export const citationFor = async (
  store: MarginsStore,
  row: LayerRow,
  span: ScalarSpan,
): Promise<Citation> => {
  const map = await store.getTextMap(row.fileHash);
  const lengths = map ? await getMarginsCore().sectionLengths(row.fileHash, map.length) : [];
  const workId = useLibraryStore.getState().library.find((b) => b.hash === row.fileHash)
    ?.ampleread?.workId;
  const work = workId ? await getWorkDetail(workId).catch(() => null) : null;
  return buildCitation({
    text: null,
    work,
    percent: anchorPercent(lengths, span.section, span.start),
    ...readerContext(row.fileHash, span.section),
  });
};
