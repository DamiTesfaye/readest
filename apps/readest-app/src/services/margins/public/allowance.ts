import type { QuoteBudget } from './api';

export interface Allowance {
  cost: number;
  left: number;
  scope: 'book' | 'chapter';
  over: boolean;
}

export const spanCost = (covered: [number, number][], start: number, end: number): number =>
  covered.reduce(
    (cost, [s, e]) => cost - Math.max(0, Math.min(e, end) - Math.max(s, start)),
    end - start,
  );

export const allowance = (b: QuoteBudget, start: number, end: number): Allowance | null => {
  if (!b.capped) return null;
  const cost = spanCost(b.covered, start, end);
  const chapterLeft = b.sectionLimit - b.sectionCovered;
  const bookLeft = b.textLimit - b.textCovered;
  const left = Math.max(0, Math.min(chapterLeft, bookLeft));
  return { cost, left, scope: bookLeft < chapterLeft ? 'book' : 'chapter', over: cost > left };
};
