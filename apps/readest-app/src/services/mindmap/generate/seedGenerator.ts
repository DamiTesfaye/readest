import type { TOCItem } from '@/libs/document';
import type { BookLocator } from '@/services/mindmap/generate/anchors';
import type { GenNode, GenRecord, MapGenerator } from '@/services/mindmap/generate/types';
import type { BookNote } from '@/types/book';

const QUOTE_TYPES: ReadonlySet<BookNote['type']> = new Set(['annotation', 'excerpt']);
const NOTE_KEY = /^(?:link:)?note:(.+)$/;

const chapterNodes = (toc: readonly TOCItem[], locator: BookLocator): GenNode[] => {
  const nodes: GenNode[] = [];
  const seen = new Set<string>();
  const walk = (items: readonly TOCItem[], parentGenKey: string | null): void => {
    for (const item of items) {
      const genKey = item.href ? `toc:${item.href}` : null;
      if (genKey && !seen.has(genKey)) {
        seen.add(genKey);
        const anchor = locator.locateToc(item);
        nodes.push({
          type: 'node',
          genKey,
          kind: 'chapter',
          label: item.sourceLabel ?? item.label,
          color: 'sky',
          anchor,
          revealAt: anchor?.progress ?? null,
          parentGenKey,
        });
      }
      walk(item.subitems ?? [], genKey ?? parentGenKey);
    }
  };
  walk(toc, null);
  const revealed: GenNode[] = [];
  let next = 1;
  for (const node of [...nodes].reverse()) {
    next = node.revealAt ?? next;
    revealed.push({ ...node, revealAt: next });
  }
  return revealed.reverse();
};

const chapterAt = (chapters: readonly GenNode[], progress: number): GenNode | null =>
  chapters.reduce<GenNode | null>((best, chapter) => {
    const start = chapter.anchor?.progress;
    if (start === undefined || start > progress) return best;
    return best && best.anchor!.progress > start ? best : chapter;
  }, null);

const quoteRecords = (
  notes: readonly BookNote[],
  chapters: readonly GenNode[],
  locator: BookLocator,
): GenRecord[] => {
  const seen = new Set<string>();
  return notes.flatMap((note): GenRecord[] => {
    const genKey = `note:${note.id}`;
    if (!QUOTE_TYPES.has(note.type) || note.deletedAt || seen.has(genKey)) return [];
    seen.add(genKey);
    const anchor = locator.locateCfi(note.cfi);
    const chapter = anchor ? chapterAt(chapters, anchor.progress) : null;
    const quote: GenNode = {
      type: 'node',
      genKey,
      kind: 'quote',
      label: note.text?.trim() || note.note.trim(),
      color: 'paper',
      anchor,
      revealAt: anchor?.progress ?? 1,
      parentGenKey: chapter?.genKey ?? null,
    };
    if (!chapter) return [quote];
    return [
      quote,
      {
        type: 'link',
        genKey: `link:${genKey}`,
        fromGenKey: chapter.genKey,
        toGenKey: genKey,
        label: '',
      },
    ];
  });
};

export const seedGenerator: MapGenerator = {
  id: 'seed',
  generate: async ({ toc, annotations, locator }) => {
    const chapters = chapterNodes(toc, locator);
    return [...chapters, ...quoteRecords(annotations, chapters, locator)];
  },
  isGone: (genKey, { annotations }) => {
    const noteId = NOTE_KEY.exec(genKey)?.[1];
    return noteId === undefined || annotations.some((note) => note.id === noteId);
  },
};
