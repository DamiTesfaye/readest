import { describe, expect, it } from 'vitest';
import type { TOCItem } from '@/libs/document';
import type { BookLocator } from '@/services/mindmap/generate/anchors';
import { seedGenerator } from '@/services/mindmap/generate/seedGenerator';
import type { GenLink, GenNode, GenRecord } from '@/services/mindmap/generate/types';
import type { Book, BookNote } from '@/types/book';

const START: Record<string, number> = {
  'part1.xhtml': 0.1,
  'ch1.xhtml#s2': 0.2,
  'ch2.xhtml': 0.4,
  'ch3.xhtml': 0.7,
};

const locator: BookLocator = {
  locateToc: (item) => {
    const progress = START[item.href];
    return progress === undefined ? null : { cfi: `cfi:${item.href}`, section: 1, progress };
  },
  locateCfi: (cfi) => (cfi.startsWith('cfi:') ? { cfi, section: 1, progress: 0.25 } : null),
};

const item = (href: string, label: string, subitems?: TOCItem[]): TOCItem =>
  ({ id: 0, href, label, index: 0, subitems }) as TOCItem;

const toc = (): TOCItem[] => [
  item('part1.xhtml', 'Part One', [
    item('part1.xhtml', 'Chapter One', [item('ch1.xhtml#s2', 'Scene Two')]),
    item('ch2.xhtml', 'Chapter Two'),
  ]),
  item('lost.xhtml', 'Interlude'),
  item('ch3.xhtml', 'Chapter Three'),
];

const note = (overrides: Partial<BookNote> = {}): BookNote => ({
  id: 'n1',
  type: 'annotation',
  cfi: 'cfi:quote',
  text: 'It is a truth universally acknowledged',
  note: '',
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const book = { hash: 'h', title: 'Emma', format: 'EPUB' } as Book;

const run = (tocItems: TOCItem[], annotations: BookNote[] = []): Promise<GenRecord[]> =>
  seedGenerator.generate({ book, toc: tocItems, annotations, intent: 'story', locator });

const nodes = (records: GenRecord[]): GenNode[] =>
  records.filter((record): record is GenNode => record.type === 'node');

const byKey = (records: GenRecord[], genKey: string): GenRecord | undefined =>
  records.find((record) => record.genKey === genKey);

describe('seedGenerator', () => {
  it('turns TOC entries into chapter nodes nested by the TOC', async () => {
    const records = await run(toc());
    expect(nodes(records).map((node) => [node.genKey, node.label, node.parentGenKey])).toEqual([
      ['toc:part1.xhtml', 'Part One', null],
      ['toc:ch1.xhtml#s2', 'Scene Two', 'toc:part1.xhtml'],
      ['toc:ch2.xhtml', 'Chapter Two', 'toc:part1.xhtml'],
      ['toc:lost.xhtml', 'Interlude', null],
      ['toc:ch3.xhtml', 'Chapter Three', null],
    ]);
    expect(nodes(records).every((node) => node.kind === 'chapter')).toBe(true);
  });

  it('keeps one node when a part and its first chapter share an href', async () => {
    const keys = (await run(toc())).map((record) => record.genKey);
    expect(keys.filter((key) => key === 'toc:part1.xhtml')).toHaveLength(1);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('reveals a chapter at its own start, including fragment hrefs', async () => {
    const records = await run(toc());
    expect((byKey(records, 'toc:ch1.xhtml#s2') as GenNode).revealAt).toBe(0.2);
    expect((byKey(records, 'toc:ch2.xhtml') as GenNode).anchor).toEqual({
      cfi: 'cfi:ch2.xhtml',
      section: 1,
      progress: 0.4,
    });
  });

  it('reveals a chapter the book cannot place with the next placed chapter', async () => {
    const records = await run(toc());
    const lost = byKey(records, 'toc:lost.xhtml') as GenNode;
    expect(lost.anchor).toBeNull();
    expect(lost.revealAt).toBe(0.7);
  });

  it('turns highlights and notes into quote nodes linked from their chapter', async () => {
    const records = await run(toc(), [
      note(),
      note({ id: 'n2', type: 'excerpt', text: '', note: 'My thought' }),
    ]);
    expect(byKey(records, 'note:n1')).toMatchObject({
      kind: 'quote',
      label: 'It is a truth universally acknowledged',
      revealAt: 0.25,
      anchor: { cfi: 'cfi:quote', section: 1, progress: 0.25 },
      parentGenKey: 'toc:ch1.xhtml#s2',
    });
    expect((byKey(records, 'note:n2') as GenNode).label).toBe('My thought');
    expect(byKey(records, 'link:note:n1')).toEqual<GenLink>({
      type: 'link',
      genKey: 'link:note:n1',
      fromGenKey: 'toc:ch1.xhtml#s2',
      toGenKey: 'note:n1',
      label: '',
    });
  });

  it('never turns bookmarks or deleted notes into quotes', async () => {
    const records = await run(toc(), [
      note({ id: 'b1', type: 'bookmark' }),
      note({ id: 'd1', deletedAt: 5 }),
    ]);
    expect(nodes(records).some((node) => node.kind === 'quote')).toBe(false);
  });

  it('keys records by identity, so renames and edits keep their keys', async () => {
    const before = await run(toc(), [note()]);
    const renamed = toc();
    renamed[2]!.label = 'Chapter the Third';
    const after = await run(renamed, [note({ text: 'Edited quote', note: 'Now with a note' })]);
    expect(after.map((record) => record.genKey)).toEqual(before.map((record) => record.genKey));
    expect((byKey(after, 'toc:ch3.xhtml') as GenNode).label).toBe('Chapter the Third');
    expect((byKey(after, 'note:n1') as GenNode).label).toBe('Edited quote');
  });

  it('leaves a quote unlinked when no chapter precedes it', async () => {
    const records = await run([], [note()]);
    expect((byKey(records, 'note:n1') as GenNode).parentGenKey).toBeNull();
    expect(records.some((record) => record.type === 'link')).toBe(false);
  });
});

describe('seedGenerator.isGone', () => {
  const input = (annotations: BookNote[]) => ({
    book,
    toc: toc(),
    annotations,
    intent: 'story' as const,
    locator,
  });

  it('treats a quote key as gone only when its booknote is known here', () => {
    const isGone = seedGenerator.isGone!;
    expect(isGone('note:n1', input([]))).toBe(false);
    expect(isGone('link:note:n1', input([]))).toBe(false);
    expect(isGone('note:n1', input([note({ deletedAt: 5 })]))).toBe(true);
    expect(isGone('link:note:n1', input([note({ type: 'bookmark' })]))).toBe(true);
    expect(isGone('toc:ch1.xhtml', input([]))).toBe(true);
  });
});

describe('seedGenerator labels', () => {
  it('labels chapters from the book, not the per-device converted label', async () => {
    const converted = {
      ...item('ch1.xhtml', '第一章 開始'),
      sourceLabel: '第一章 开始',
    } as TOCItem;
    const [chapter] = nodes(await run([converted]));
    expect(chapter!.label).toBe('第一章 开始');
  });
});

describe('seedGenerator quotes the book cannot place', () => {
  it('reveals a highlight with a stale position only at the end, never at once', async () => {
    const stale = note({ id: 'stale', cfi: 'epubcfi(/6/999!/4/2/1:0)' });
    const [quote] = nodes(await run([], [stale]));
    expect(quote).toMatchObject({ genKey: 'note:stale', anchor: null, revealAt: 1 });
  });
});
