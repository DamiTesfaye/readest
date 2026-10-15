import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ getWorkDetail: vi.fn() }));

vi.mock('@/services/ampleread', async (orig) => ({
  ...(await orig<typeof import('@/services/ampleread')>()),
  getWorkDetail: h.getWorkDetail,
}));
vi.mock('@/services/margins/marginsClient', () => ({
  getMarginsCore: () => ({ sectionLengths: async () => [100, 300] }),
}));

import { CitationLine } from '@/components/margins/CitationLine';
import type { WorkDetail } from '@/services/ampleread/types';
import {
  anchorPercent,
  buildCitation,
  citationFor,
  formatCitation,
  readerContext,
} from '@/services/margins/public/citation';
import type { LayerRow, MarginText, MarginsStore } from '@/services/margins/store';
import { useLibraryStore } from '@/store/libraryStore';
import type { Book } from '@/types/book';
import { useReaderStore } from '@/store/readerStore';
import type { BookProgress } from '@/types/book';

const book = { title: 'Meditations', author: 'Marcus Aurelius' };

const work = (title: string, author: string): WorkDetail & { author: string } => ({
  id: 'wrk_1',
  title,
  author,
  description: null,
  subjects: [],
  preferredEditionId: null,
  editions: [
    {
      id: 'ed_0',
      sourceName: 'Audio Source',
      language: 'en',
      mediaType: 'audio/mpeg',
      assets: [],
      capabilities: { canRead: false, canDownload: true, canTransform: false },
      attribution: null,
    },
    {
      id: 'ed_1',
      sourceName: 'Project Gutenberg',
      language: 'en',
      mediaType: 'application/epub+zip',
      assets: [{ id: 'a', kind: 'epub', bytes: 10 }],
      capabilities: { canRead: true, canDownload: true, canTransform: false },
      attribution: null,
    },
  ],
});

afterEach(() => {
  cleanup();
  useReaderStore.setState({ bookKeys: [] });
});

describe('citations', () => {
  it('formats every part as plain text and drops missing ones', () => {
    expect(
      formatCitation(
        { publisher: 'Gutenberg', year: 2001, page: '16', chapter: 'Book II', percent: 9 },
        book,
      ),
    ).toBe('Meditations · Marcus Aurelius · Gutenberg, 2001 ed. · p. 16 · Book II');
    expect(formatCitation({ percent: 9 }, { title: 'Meditations', author: null })).toBe(
      'Meditations · 9%',
    );
    expect(formatCitation({}, null)).toBe('');
    expect(formatCitation({ percent: 9 }, book)).not.toMatch(/\*/);
  });

  it('renders the title in a cite element', () => {
    render(
      <CitationLine
        citation={{ percent: 9 }}
        book={{ ...book, workId: null, capped: false, findUrl: null }}
      />,
    );
    expect(screen.getByText('Meditations').tagName).toBe('CITE');
    expect(screen.getByText(/Marcus Aurelius · 9%/)).toBeTruthy();
  });

  it('takes the edition from the catalog work, cuts the chapter to 120 and computes the percent', () => {
    const c = buildCitation({
      text: { title: 'Meds', author: null } as MarginText,
      work: work('Meditations', 'Marcus Aurelius'),
      percent: anchorPercent([100, 300], 1, 150),
      chapter: 'c'.repeat(200),
    });
    expect(c).toMatchObject({ percent: 63, publisher: 'Project Gutenberg' });
    expect(c).not.toHaveProperty('title');
    expect(c).not.toHaveProperty('page');
    expect([...c.chapter!].length).toBe(120);
  });

  it('reads only the chapter from a reader open on the section, never its current page', () => {
    const progress = { index: 2, sectionLabel: 'Book II', pageItem: { label: '40' } };
    useReaderStore.setState({
      bookKeys: ['hash1-abc'],
      getProgress: (key: string) => (key === 'hash1-abc' ? (progress as BookProgress) : null),
    });
    expect(readerContext('hash1', 2)).toEqual({ page: null, chapter: 'Book II' });
    expect(readerContext('hash1', 3)).toEqual({ page: null, chapter: null });
    expect(readerContext('hash2', 2)).toEqual({ page: null, chapter: null });
  });

  it('builds a publish citation from the linked work and the book position', async () => {
    h.getWorkDetail.mockResolvedValue(work('Meditations', 'Marcus Aurelius'));
    useLibraryStore.setState({
      library: [{ hash: 'hash1', ampleread: { workId: 'wrk_1', editionId: 'ed_1' } } as Book],
    });
    const store = { getTextMap: async () => [{}, {}] } as unknown as MarginsStore;
    const row = { fileHash: 'hash1' } as LayerRow;
    const span = { section: 1, start: 150, end: 160, sectionLen: 300 };
    expect(await citationFor(store, row, span)).toEqual({
      publisher: 'Project Gutenberg',
      percent: 63,
    });
    expect(h.getWorkDetail).toHaveBeenCalledWith('wrk_1');
    h.getWorkDetail.mockRejectedValue(new Error('offline'));
    expect(await citationFor(store, row, span)).toEqual({ percent: 63 });
    useLibraryStore.setState({ library: [] });
    expect(await citationFor(store, row, span)).toEqual({ percent: 63 });
  });
});
