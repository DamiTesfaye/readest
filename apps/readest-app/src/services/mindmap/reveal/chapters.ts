import type { TOCItem } from '@/libs/document';
import type { BookLocator } from '@/services/mindmap/generate/anchors';

export interface ChapterStart {
  start: number;
  number: number;
}

const MAX_CHAPTER = 300;
const CHAPTER_WORD = /^\s*(?:chapter|chap\.|ch\.)\s*([0-9]+|[a-z]+(?:-[a-z]+)?)\b/i;
const LEADING_ARABIC = /^\s*(\d+)(?:[.:)](?!\d)|\s)/;
const LEADING_ROMAN = /^\s*([ivxlcdm]+)[.:)](?!\d)/i;
const ROMAN = /^m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/;
const ROMAN_VALUES: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
const UNITS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

const romanValue = (token: string): number | null => {
  const roman = token.toLowerCase();
  if (!ROMAN.test(roman)) return null;
  let total = 0;
  for (let i = 0; i < roman.length; i += 1) {
    const value = ROMAN_VALUES[roman[i]!]!;
    const next = ROMAN_VALUES[roman[i + 1] ?? ''] ?? 0;
    total += value < next ? -value : value;
  }
  return total;
};

const wordValue = (token: string): number | null => {
  const [first = '', second] = token.toLowerCase().split('-');
  const unit = UNITS.indexOf(first);
  if (unit > 0 && second === undefined) return unit;
  const tens = TENS.indexOf(first);
  if (tens < 2) return null;
  if (second === undefined) return tens * 10;
  const ones = UNITS.indexOf(second);
  return ones > 0 && ones < 10 ? tens * 10 + ones : null;
};

const tokenValue = (token: string): number | null =>
  /^\d+$/.test(token) ? Number(token) : (romanValue(token) ?? wordValue(token));

export const chapterNumberOf = (label: string): number | null => {
  const token =
    CHAPTER_WORD.exec(label)?.[1] ??
    LEADING_ARABIC.exec(label)?.[1] ??
    LEADING_ROMAN.exec(label)?.[1];
  const value = token ? tokenValue(token) : null;
  return value !== null && value > 0 && value <= MAX_CHAPTER ? value : null;
};

const byStart = (chapters: readonly ChapterStart[]): ChapterStart[] => {
  const seen = new Set<number>();
  return [...chapters]
    .sort((a, b) => a.start - b.start)
    .filter(({ start }) => !seen.has(start) && seen.add(start));
};

export const chapterStarts = (toc: readonly TOCItem[], locator: BookLocator): ChapterStart[] => {
  const numbered: ChapterStart[] = [];
  const leaves: ChapterStart[] = [];
  const walk = (items: readonly TOCItem[]): void => {
    for (const item of items) {
      const start = locator.locateToc(item)?.progress;
      const number = chapterNumberOf(item.label);
      if (start !== undefined && number !== null) numbered.push({ start, number });
      const children = item.subitems ?? [];
      if (children.length > 0) walk(children);
      else if (start !== undefined) leaves.push({ start, number: 0 });
    }
  };
  walk(toc);
  if (numbered.length > 0) return byStart(numbered);
  return byStart(leaves).map(({ start }, index) => ({ start, number: index + 1 }));
};
