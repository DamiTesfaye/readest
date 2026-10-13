import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as CFI from 'foliate-js/epubcfi.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DocumentLoader, type BookDoc } from '@/libs/document';
import { transformTTSSectionDocument } from '@/services/tts/transformDoc';
import {
  createAnchor,
  liveRange,
  resolveAnchor,
  type BridgeContext,
} from '@/services/margins/anchorBridge';
import { buildTextMap } from '@/services/margins/textMap';
import type { MarginsCore } from '@/services/margins/marginsClient';
import type { MarginsStore } from '@/services/margins/store';
import type { SectionInput } from '@/services/margins/types';
import type { Book } from '@/types/book';
import { createTestCore } from './coreHarness';

const memoryStore = () => {
  const maps = new Map<string, SectionInput[]>();
  return {
    getTextMap: async (h: string) => maps.get(h) ?? null,
    putTextMap: async (h: string, s: SectionInput[]) => void maps.set(h, s),
  } as unknown as MarginsStore;
};

const openAlice = async () => {
  const buffer = readFileSync(resolve(__dirname, '../../fixtures/data/sample-alice.epub'));
  const file = new File([buffer], 'sample-alice.epub', { type: 'application/epub+zip' });
  return (await new DocumentLoader(file).open()).book as BookDoc;
};

const textRange = (doc: Document, text: string) => {
  const walker = doc.createTreeWalker(doc.documentElement, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const at = n.nodeValue!.indexOf(text);
    if (at < 0) continue;
    const range = doc.createRange();
    range.setStart(n, at);
    range.setEnd(n, at + text.length);
    return range;
  }
  throw new Error(`not found: ${text}`);
};

const transformer = (edit: (data: string) => string) => {
  const target = new EventTarget();
  target.addEventListener('data', (e) => {
    const detail = (e as CustomEvent<{ data: string }>).detail;
    detail.data = edit(detail.data);
  });
  return target;
};

const xhtmlBook = (body: string) =>
  ({
    metadata: { language: 'en' },
    sections: [
      {
        id: 's0',
        cfi: CFI.fake.fromIndex(0),
        createDocument: async () =>
          new DOMParser().parseFromString(
            `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title></head><body>${body}</body></html>`,
            'application/xhtml+xml',
          ),
      },
    ],
  }) as unknown as BookDoc;

const fakeCFI = (i: number, r: Range) => CFI.joinIndir(CFI.fake.fromIndex(i), CFI.fromRange(r));

let core: MarginsCore;

const open = async (
  hash: string,
  bookDoc: BookDoc,
  live: (i: number, raw: Document) => Promise<Document>,
  overrides: Partial<BridgeContext> = {},
) => {
  const book = { hash, primaryLanguage: bookDoc.metadata?.language ?? 'en' } as unknown as Book;
  await core.loadBook(hash, await buildTextMap(bookDoc, book, memoryStore()));
  const docs = await Promise.all(
    bookDoc.sections.map(async (s, i) => live(i, await s.createDocument())),
  );
  const ctx: BridgeContext = {
    book,
    bookDoc,
    core,
    ready: Promise.resolve(),
    capped: true,
    getCFI: (i, r) => CFI.joinIndir(bookDoc.sections[i]!.cfi, CFI.fromRange(r)),
    liveDoc: (i) => docs[i] ?? null,
    inFamily: () => false,
    ...overrides,
  };
  return { ctx, docs };
};

const sectionWith = (docs: Document[], text: string) =>
  docs.findIndex((d) => d.documentElement.textContent?.includes(text));

describe('anchor bridge', () => {
  let alice: BookDoc;
  beforeAll(async () => {
    core = await createTestCore();
    alice = await openAlice();
  });

  it('round-trips a selection on sample-alice.epub at step 1', async () => {
    const { ctx, docs } = await open('alice', alice, async (_, raw) => raw);
    const quote = 'Alice was beginning to get very tired';
    const i = sectionWith(docs, quote);
    const anchor = await createAnchor(ctx, textRange(docs[i]!, quote), i);
    expect(anchor.quote).toEqual({ exact: quote });
    const placed = await resolveAnchor(ctx, anchor);
    expect(placed.step).toBe(1);
    expect(placed.sectionIndex).toBe(i);
    expect(placed.range?.toString()).toBe(quote);
  });

  it('reports canonical offsets that map back to the same live range', async () => {
    const { ctx, docs } = await open('alice', alice, async (_, raw) => raw);
    const quote = 'very tired of sitting';
    const i = sectionWith(docs, quote);
    const placed = await resolveAnchor(ctx, await createAnchor(ctx, textRange(docs[i]!, quote), i));
    const [start, end] = placed.canonical!;
    expect(end).toBeGreaterThan(start);
    expect((await liveRange(ctx, i, start, end))?.toString()).toBe(placed.range?.toString());
    expect(await liveRange({ ...ctx, liveDoc: () => null }, i, start, end)).toBeNull();
  });

  it('survives a proofread insertion in the live text node', async () => {
    const target = transformer((d) => d.replace('very tired', 'very [proofread] tired'));
    const { ctx, docs } = await open('alice', alice, (i, raw) =>
      transformTTSSectionDocument({ transformTarget: target }, alice.sections[i]!.id, raw),
    );
    const i = sectionWith(docs, '[proofread]');
    expect(i).toBeGreaterThanOrEqual(0);
    const anchor = await createAnchor(ctx, textRange(docs[i]!, 'tired of sitting'), i);
    expect(anchor.quote).toEqual({ exact: 'tired of sitting' });
    const placed = await resolveAnchor(ctx, anchor);
    expect(placed.range?.toString()).toBe('tired of sitting');
    expect(placed.step).toBe(1);
  });

  it('carries the raw quote under a simplecc display transform', async () => {
    const xhtml = `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" lang="zh-Hant"><head><title>t</title></head><body><p>後來他說話了。</p></body></html>`;
    const bookDoc = {
      metadata: { language: 'zh-Hant' },
      sections: [
        {
          id: 's0',
          cfi: CFI.fake.fromIndex(0),
          createDocument: async () =>
            new DOMParser().parseFromString(xhtml, 'application/xhtml+xml'),
        },
      ],
    } as unknown as BookDoc;
    const map: Record<string, string> = { 後: '后', 來: '来', 說: '说', 話: '话' };
    const target = transformer((d) => d.replace(/[後來說話]/g, (c) => map[c]!));
    const { ctx, docs } = await open(
      'zh',
      bookDoc,
      (_, raw) => transformTTSSectionDocument({ transformTarget: target }, 's0', raw),
      { getCFI: (i, r) => CFI.joinIndir(CFI.fake.fromIndex(i), CFI.fromRange(r)) },
    );
    expect(docs[0]!.documentElement.textContent).toContain('后来他说话了');
    const anchor = await createAnchor(ctx, textRange(docs[0]!, '说话'), 0);
    expect(anchor.quote).toEqual({ exact: '說話' });
    const placed = await resolveAnchor(ctx, anchor);
    expect(placed.range?.toString()).toBe('说话');
  });

  it('keeps a combining mark with its base at the range end', async () => {
    const { ctx, docs } = await open(
      'mark',
      xhtmlBook('<p>un cafe\u0301 noir</p>'),
      async (_, raw) => raw,
      {
        getCFI: fakeCFI,
      },
    );
    const text = docs[0]!.querySelector('p')!.firstChild!;
    const range = docs[0]!.createRange();
    range.setStart(text, 3);
    range.setEnd(text, 7);
    const anchor = await createAnchor(ctx, range, 0);
    expect(anchor.quote).toEqual({ exact: 'caf\u00e9' });
    expect((await resolveAnchor(ctx, anchor)).range?.toString()).toBe('cafe\u0301');
  });

  it('anchors a selection made of element boundaries', async () => {
    const { ctx, docs } = await open(
      'blocks',
      xhtmlBook('<p>First <em>para</em>graph.</p><p>Second one.</p>'),
      async (_, raw) => raw,
      { getCFI: fakeCFI },
    );
    const range = docs[0]!.createRange();
    range.selectNodeContents(docs[0]!.querySelectorAll('p')[0]!);
    const anchor = await createAnchor(ctx, range, 0);
    expect(anchor.quote).toEqual({ exact: 'First paragraph.' });
    expect((await resolveAnchor(ctx, anchor)).range?.toString()).toBe('First paragraph.');
  });

  it('detaches an anchor from another book', async () => {
    await core.loadBook('other', [
      {
        runs: ['The quick brown fox jumps over the lazy dog by the river.'],
        breaks: [],
        skip: false,
      },
    ]);
    const anchor = await core.buildAnchor('other', {
      section: 0,
      start: 4,
      end: 19,
      capped: true,
      file: { fileHash: 'other', cfi: 'epubcfi(/6/2!/4/2,/1:4,/1:19)' },
    });
    const { ctx } = await open('alice', alice, async (_, raw) => raw);
    const placed = await resolveAnchor(ctx, anchor);
    expect(placed).toMatchObject({ range: null, reason: 'no_match' });
  });

  it('reports a passage cut from this version of the text', async () => {
    const quote = 'Alice was beginning to get very tired';
    const { ctx: full, docs } = await open('alice', alice, async (_, raw) => raw);
    const i = sectionWith(docs, quote);
    const anchor = await createAnchor(full, textRange(docs[i]!, quote), i);

    const cut = {
      ...alice,
      sections: alice.sections.map((s) => ({
        ...s,
        createDocument: async () => {
          const doc = await s.createDocument();
          const p = Array.from(doc.querySelectorAll('p')).find((el) =>
            el.textContent?.includes(quote),
          );
          p?.remove();
          return doc;
        },
      })),
    } as BookDoc;
    const { ctx } = await open('alice-cut', cut, async (_, raw) => raw, { inFamily: () => true });
    const placed = await resolveAnchor(ctx, anchor);
    expect(placed.range).toBeNull();
    expect(placed.sectionIndex).toBe(i);
    expect(placed.notInThisVersion?.near).toBeInstanceOf(Range);
    expect(placed.notInThisVersion?.near?.collapsed).toBe(true);
    expect(placed.notInThisVersion?.at).toEqual(expect.any(Number));
    expect(placed.canonical).toBeUndefined();
  });

  it('waits for the book to be ready before touching the core', async () => {
    let release!: () => void;
    const ready = new Promise<void>((r) => (release = r));
    const { ctx, docs } = await open('alice', alice, async (_, raw) => raw, { ready });
    const spy = vi.spyOn(core, 'buildAnchor');
    const quote = 'Alice was beginning';
    const i = sectionWith(docs, quote);
    const pending = createAnchor(ctx, textRange(docs[i]!, quote), i);
    await new Promise((r) => setTimeout(r, 10));
    expect(spy).not.toHaveBeenCalled();
    release();
    expect((await pending).quote).toEqual({ exact: quote });
    spy.mockRestore();
  });
});
