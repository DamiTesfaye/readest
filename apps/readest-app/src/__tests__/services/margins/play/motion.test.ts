import { describe, expect, it } from 'vitest';
import { lerpFactor } from '@/services/margins/play/motion';

describe('lerp', () => {
  it('matches the demo at 60 fps, is frame-rate independent and is 1 under reduced motion', () => {
    expect(lerpFactor(16.7, false)).toBeCloseTo(0.22, 3);
    expect(lerpFactor(33.4, false)).toBeCloseTo(1 - (1 - lerpFactor(16.7, false)) ** 2, 6);
    expect(lerpFactor(16.7, true)).toBe(1);
  });
});
