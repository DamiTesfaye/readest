import { describe, expect, it } from 'vitest';

import { computeLookX } from '@/utils/caretLook';

const metrics = (overrides: Partial<Parameters<typeof computeLookX>[0]> = {}) => ({
  textWidth: 0,
  scrollLeft: 0,
  contentWidth: 200,
  rtl: false,
  ...overrides,
});

describe('computeLookX', () => {
  it('maps a caret at the start of the field to -1', () => {
    expect(computeLookX(metrics({ textWidth: 0 }))).toBe(-1);
  });

  it('maps a caret at the middle of the field to 0', () => {
    expect(computeLookX(metrics({ textWidth: 100 }))).toBe(0);
  });

  it('maps a caret at the end of the field to 1', () => {
    expect(computeLookX(metrics({ textWidth: 200 }))).toBe(1);
  });

  it('maps a caret a quarter across the field to -0.5', () => {
    expect(computeLookX(metrics({ textWidth: 50 }))).toBe(-0.5);
  });

  it('subtracts scrollLeft so an overflowing field stops driving the eyes', () => {
    expect(computeLookX(metrics({ textWidth: 300, scrollLeft: 200 }))).toBe(0);
  });

  it('treats scrollLeft as a magnitude, since RTL fields report it negative', () => {
    expect(computeLookX(metrics({ textWidth: 300, scrollLeft: -200, rtl: true }))).toBeCloseTo(0);
  });

  it('clamps a caret measured past the right edge to 1', () => {
    expect(computeLookX(metrics({ textWidth: 900 }))).toBe(1);
  });

  it('clamps a caret measured past the left edge to -1', () => {
    expect(computeLookX(metrics({ textWidth: 0, scrollLeft: 300 }))).toBe(-1);
  });

  it('inverts the mapping for RTL, where text grows from the right edge', () => {
    expect(computeLookX(metrics({ textWidth: 50, rtl: true }))).toBe(0.5);
    expect(computeLookX(metrics({ textWidth: 200, rtl: true }))).toBe(-1);
  });

  it('stays finite when the field has no usable width', () => {
    const lookX = computeLookX(metrics({ textWidth: 40, contentWidth: 0 }));
    expect(Number.isFinite(lookX)).toBe(true);
    expect(lookX).toBeGreaterThanOrEqual(-1);
    expect(lookX).toBeLessThanOrEqual(1);
  });
});
