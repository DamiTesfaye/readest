import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CitationLine } from '@/components/margins/CitationLine';
import type { WorkDetail } from '@/services/ampleread/types';
import {
  anchorPercent,
  buildCitation,
  formatCitation,
  readerContext,
} from '@/services/margins/public/citation';
import type { MarginText } from '@/services/margins/store';
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

  it('reads the page and chapter only from a reader open on the section', () => {
    const progress = { index: 2, sectionLabel: 'Book II', pageItem: { label: '16' } };
    useReaderStore.setState({
      bookKeys: ['hash1-abc'],
      getProgress: (key: string) => (key === 'hash1-abc' ? (progress as BookProgress) : null),
    });
    expect(readerContext('hash1', 2)).toEqual({ page: '16', chapter: 'Book II' });
    expect(readerContext('hash1', 3)).toEqual({ page: null, chapter: null });
    expect(readerContext('hash2', 2)).toEqual({ page: null, chapter: null });
  });
});
