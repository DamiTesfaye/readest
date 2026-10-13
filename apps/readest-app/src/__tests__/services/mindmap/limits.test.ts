import { describe, expect, it } from 'vitest';
import { FREE_MAP_LIMIT, canCreateMap } from '@/services/mindmap/limits';

describe('canCreateMap', () => {
  it('blocks a free-plan user at or above the free limit', () => {
    expect(canCreateMap('free', FREE_MAP_LIMIT)).toBe(false);
    expect(canCreateMap('free', FREE_MAP_LIMIT + 1)).toBe(false);
  });

  it('allows a free-plan user below the free limit', () => {
    expect(canCreateMap('free', 0)).toBe(true);
    expect(canCreateMap('free', FREE_MAP_LIMIT - 1)).toBe(true);
  });

  it('allows every other plan regardless of count', () => {
    expect(canCreateMap('plus', 100)).toBe(true);
    expect(canCreateMap('pro', FREE_MAP_LIMIT)).toBe(true);
    expect(canCreateMap('purchase', FREE_MAP_LIMIT)).toBe(true);
  });
});
