import { describe, expect, it } from 'vitest';
import { createTierMonitor } from '@/services/margins/play/tiers';

describe('tiers', () => {
  it('steps down P1 → P2 → P3 → P4 on sustained slow frames', () => {
    const m = createTierMonitor();
    for (let i = 0; i < 60; i++) m.record(10);
    expect(m.tier).toBe('P1');
    const seen = Array.from({ length: 240 }, () => m.record(50));
    expect([...new Set(seen)]).toEqual(['P1', 'P2', 'P3', 'P4']);
  });
});
