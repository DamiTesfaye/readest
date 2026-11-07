import { describe, expect, it } from 'vitest';
import { allowance, spanCost } from '@/services/margins/public/allowance';
import type { QuoteBudget } from '@/services/margins/public/api';

const budget = (o: Partial<QuoteBudget> = {}): QuoteBudget => ({
  capped: true,
  covered: [],
  sectionLimit: 150,
  sectionCovered: 100,
  textLimit: 1000,
  textCovered: 900,
  ...o,
});

describe('quote allowance', () => {
  it('charges only the scalars not already covered', () => {
    expect(spanCost([[10, 30]], 12, 28)).toBe(0);
    expect(spanCost([[10, 30]], 25, 40)).toBe(10);
    expect(
      spanCost(
        [
          [0, 5],
          [8, 10],
        ],
        0,
        10,
      ),
    ).toBe(3);
    expect(spanCost([], 4, 9)).toBe(5);
  });

  it('takes the chapter limit when it is tighter', () => {
    expect(allowance(budget(), 0, 20)).toEqual({
      cost: 20,
      left: 50,
      scope: 'chapter',
      over: false,
    });
  });

  it('takes the book limit when it is tighter', () => {
    expect(allowance(budget({ textCovered: 990 }), 0, 20)).toEqual({
      cost: 20,
      left: 10,
      scope: 'book',
      over: true,
    });
  });

  it('never leaves less than nothing', () => {
    expect(allowance(budget({ sectionCovered: 200 }), 0, 1)).toMatchObject({ left: 0, over: true });
  });

  it('is null on an uncapped text', () => {
    expect(allowance(budget({ capped: false }), 0, 20)).toBeNull();
  });
});
