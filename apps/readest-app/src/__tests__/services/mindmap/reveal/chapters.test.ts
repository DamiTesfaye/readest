import { describe, expect, it } from 'vitest';
import type { TOCItem } from '@/libs/document';
import type { BookLocator } from '@/services/mindmap/generate/anchors';
import { chapterNumberOf, chapterStarts } from '@/services/mindmap/reveal/chapters';
import { chapterAt } from '@/services/mindmap/reveal/visibility';

const item = (href: string, label: string, subitems?: TOCItem[]): TOCItem =>
  ({ id: 0, href, label, index: 0, subitems }) as TOCItem;

const locatorFor = (starts: Record<string, number>): BookLocator => ({
  locateToc: (entry) => {
    const progress = starts[entry.href];
    return progress === undefined ? null : { cfi: '', section: 0, progress };
  },
  locateCfi: () => null,
});

describe('chapterNumberOf', () => {
  it('reads the numeral a chapter label carries', () => {
    expect(chapterNumberOf('Chapter 10 - Alice’s Evidence')).toBe(10);
    expect(chapterNumberOf('CHAPTER IV.')).toBe(4);
    expect(chapterNumberOf('Ch. 7: The Storm')).toBe(7);
    expect(chapterNumberOf('Chapter Twelve')).toBe(12);
    expect(chapterNumberOf('Chapter Twenty-One')).toBe(21);
    expect(chapterNumberOf('3. The Voyage')).toBe(3);
    expect(chapterNumberOf('XII. The Return')).toBe(12);
  });

  it('never numbers front matter, sections or parts', () => {
    expect(chapterNumberOf('Title')).toBeNull();
    expect(chapterNumberOf('About')).toBeNull();
    expect(chapterNumberOf('a Long Tale')).toBeNull();
    expect(chapterNumberOf('1.2 Background')).toBeNull();
    expect(chapterNumberOf('Part II')).toBeNull();
    expect(chapterNumberOf('I Am Legend')).toBeNull();
    expect(chapterNumberOf('Mix: A Memoir')).toBeNull();
  });
});

describe('chapterStarts', () => {
  it('numbers chapters by their labels, skipping front matter and split headings', () => {
    const toc = [
      item('title', 'Title'),
      item('about', 'About'),
      item('ch1', 'CHAPTER I.', [item('ch1#t', 'Down the Rabbit-Hole')]),
      item('ch2', 'CHAPTER II.', [item('ch2#t', 'The Pool of Tears')]),
    ];
    const locator = locatorFor({ title: 0, about: 0.02, ch1: 0.05, 'ch1#t': 0.051, ch2: 0.3 });
    const chapters = chapterStarts(toc, locator);
    expect(chapters).toEqual([
      { start: 0.05, number: 1 },
      { start: 0.3, number: 2 },
    ]);
    expect(chapterAt(chapters, 0.02)).toBeNull();
    expect(chapterAt(chapters, 0.1)).toBe(1);
    expect(chapterAt(chapters, 0.4)).toBe(2);
  });

  it('numbers a chapter by its own label even when it has sections', () => {
    const toc = [
      item('c1', 'Chapter 1', [item('s11', '1.1 Setup'), item('s12', '1.2 Method')]),
      item('c2', 'Chapter 2', [item('s21', '2.1 Results')]),
    ];
    const locator = locatorFor({ c1: 0, s11: 0.05, s12: 0.1, c2: 0.5, s21: 0.55 });
    expect(chapterAt(chapterStarts(toc, locator), 0.6)).toBe(2);
  });

  it('falls back to leaf order when no label carries a number', () => {
    const toc = [
      item('part1', 'The Beginning', [item('a', 'Arrival'), item('b', 'Storm')]),
      item('c', 'Departure'),
    ];
    const locator = locatorFor({ part1: 0, a: 0.1, b: 0.2, c: 0.6 });
    expect(chapterStarts(toc, locator)).toEqual([
      { start: 0.1, number: 1 },
      { start: 0.2, number: 2 },
      { start: 0.6, number: 3 },
    ]);
  });
});
