import { describe, expect, it } from 'vitest';

import {
  HOME_ROW_SUBTITLES,
  RETURN_TO_BASE_ODDS,
  RETURN_TO_BASE_SUBTITLE,
  getHomeRowVariant,
} from '@/utils/homeRowVariant';

const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 15);

describe('getHomeRowVariant', () => {
  it('offers the eight homeward subtitles', () => {
    expect(HOME_ROW_SUBTITLES).toEqual([
      'Head back home',
      'Make your way home',
      'Return home',
      'Back to home screen',
      'Return to home page',
      'Make tracks for home',
      'Set off for home',
      'Home sweet home',
    ]);
  });

  it('stays the same for the same day, time bucket, book and session', () => {
    const factors = { now: at(2, 9), bookKey: 'abc123-xyz', sessionSeed: 42 };
    const first = getHomeRowVariant(factors);
    expect(getHomeRowVariant({ ...factors, now: at(2, 11) })).toEqual(first);
  });

  it('ignores the per-open suffix of the book key', () => {
    const now = at(2, 9);
    expect(getHomeRowVariant({ now, bookKey: 'abc123-one', sessionSeed: 7 })).toEqual(
      getHomeRowVariant({ now, bookKey: 'abc123-two', sessionSeed: 7 }),
    );
  });

  it('changes across days, time buckets, books and sessions', () => {
    const variants = new Set<string>();
    for (let day = 1; day <= 6; day++) {
      for (const hour of [3, 9, 15, 21]) {
        for (const bookKey of ['aaa-1', 'bbb-1']) {
          for (const sessionSeed of [1, 2]) {
            variants.add(getHomeRowVariant({ now: at(day, hour), bookKey, sessionSeed }).subtitle);
          }
        }
      }
    }
    expect(variants.size).toBeGreaterThanOrEqual(6);
  });

  it('pairs every regular subtitle with the house icon', () => {
    for (let sessionSeed = 0; sessionSeed < 200; sessionSeed++) {
      const variant = getHomeRowVariant({ now: at(2, 9), bookKey: 'abc123-xyz', sessionSeed });
      if (variant.subtitle !== RETURN_TO_BASE_SUBTITLE) {
        expect(HOME_ROW_SUBTITLES).toContain(variant.subtitle);
        expect(variant.icon).toBe('go-home');
      }
    }
  });

  it('rarely returns to base with the space base icon', () => {
    let returnToBase = 0;
    const samples = 5000;
    for (let sessionSeed = 0; sessionSeed < samples; sessionSeed++) {
      const variant = getHomeRowVariant({ now: at(2, 9), bookKey: 'abc123-xyz', sessionSeed });
      if (variant.subtitle === RETURN_TO_BASE_SUBTITLE) {
        returnToBase++;
        expect(variant.icon).toBe('space-base');
      }
    }
    const expected = samples / RETURN_TO_BASE_ODDS;
    expect(returnToBase).toBeGreaterThan(expected * 0.5);
    expect(returnToBase).toBeLessThan(expected * 1.5);
  });
});
