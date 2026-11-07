import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DocumentLoader, type BookDoc } from '@/libs/document';
import { loadTextWalker, makeAcceptNode } from '@/services/librarySearchService';
import { buildTextMap, walkSection } from '@/services/margins/textMap';
import type { MarginsStore } from '@/services/margins/store';
import type { SectionInput } from '@/services/margins/types';
import type { MarginsCore } from '@/services/margins/marginsClient';
import type { Book } from '@/types/book';
import { createTestCore, marginsPkg } from './coreHarness';

const book = (primaryLanguage = 'en') => ({ hash: 'h', primaryLanguage }) as Book;

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

describe('walkSection level-2 conformance', () => {
  let core: MarginsCore;
  beforeAll(async () => {
    core = await createTestCore();
  });

  const vectors = JSON.parse(readFileSync(`${marginsPkg}/conformance/xhtml.json`, 'utf8')) as {
    file: string;
    lang: string;
    canonical: string;
  }[];

  it.each(vectors)('$file', async ({ file, lang, canonical }) => {
    const xml = readFileSync(`${marginsPkg}/conformance/${file}`, 'utf8');
    const doc = new DOMParser().parseFromString(xml, 'application/xhtml+xml');
    const { input, nodes } = await walkSection(doc, book(lang));
    expect(nodes).toHaveLength(input.runs.length);
    await core.loadBook(file, [input]);
    expect((await core.canonicalSection(file, 0)).text).toBe(canonical);
  });

  it('marks front matter and nav documents as skip', async () => {
    const parse = (body: string) =>
      new DOMParser().parseFromString(
        `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>${body}</body></html>`,
        'application/xhtml+xml',
      );
    const skip = async (body: string) => (await walkSection(parse(body), book())).input.skip;
    expect(await skip('<section epub:type="frontmatter copyright-page"><p>c</p></section>')).toBe(
      true,
    );
    expect(await skip('<nav epub:type="toc"><ol><li>a</li></ol></nav>')).toBe(true);
    expect(await skip('<section epub:type="chapter"><p>c</p></section>')).toBe(false);
  });
});

describe('buildTextMap on sample-alice.epub', () => {
  it('walks the same text as library search and caches the map', async () => {
    const bookDoc = await openAlice();
    const spies = bookDoc.sections.map((s) => vi.spyOn(s, 'createDocument'));
    const store = memoryStore();
    const map = await buildTextMap(bookDoc, book(), store);
    expect(map).toHaveLength(bookDoc.sections.length);

    const walker = await loadTextWalker();
    for (const [i, section] of bookDoc.sections.entries()) {
      const doc = await section.createDocument();
      let searchText = '';
      Array.from(
        walker(
          doc,
          (strings: string[]) => {
            searchText = strings.join('');
            return [];
          },
          makeAcceptNode(book()),
        ),
      );
      expect(map[i]!.runs.join(''), `section ${i}`).toBe(searchText);
    }
    expect(map.some((s) => s.runs.join('').includes('Alice was beginning'))).toBe(true);

    spies.forEach((s) => s.mockClear());
    expect(await buildTextMap(bookDoc, book(), store)).toEqual(map);
    spies.forEach((s) => expect(s).not.toHaveBeenCalled());
  });
});

describe('BLOCK_TAGS', () => {
  it('matches margin-core', async () => {
    const { BLOCK_TAGS } = await import('@/services/margins/textMap');
    expect(BLOCK_TAGS).toEqual(
      JSON.parse(readFileSync(`${marginsPkg}/conformance/block-tags.json`, 'utf8')),
    );
  });
});
