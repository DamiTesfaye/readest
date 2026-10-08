import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyPagingAnimation,
  prefersReducedMotion,
  resolveUIAnimationsEnabled,
} from '@/utils/animation';

const stubMatchMedia = (matches: boolean) => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches } as MediaQueryList));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('prefersReducedMotion', () => {
  it('returns true when the media query matches', () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
  });

  it('returns false when the media query does not match', () => {
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('returns false when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('resolveUIAnimationsEnabled', () => {
  it('returns true for an explicit true even under OS reduce motion', () => {
    stubMatchMedia(true);
    expect(resolveUIAnimationsEnabled({ uiAnimationsEnabled: true })).toBe(true);
  });

  it('returns false for an explicit false even without OS reduce motion', () => {
    stubMatchMedia(false);
    expect(resolveUIAnimationsEnabled({ uiAnimationsEnabled: false })).toBe(false);
  });

  it('follows the OS preference when unset: reduce motion on means disabled', () => {
    stubMatchMedia(true);
    expect(resolveUIAnimationsEnabled({})).toBe(false);
  });

  it('follows the OS preference when unset: reduce motion off means enabled', () => {
    stubMatchMedia(false);
    expect(resolveUIAnimationsEnabled({})).toBe(true);
  });
});

describe('applyPagingAnimation', () => {
  it('animates page turns only when paging animation and UI animations are both on', () => {
    const renderer = document.createElement('div');
    applyPagingAnimation(renderer, true, true);
    expect(renderer.hasAttribute('animated')).toBe(true);
    applyPagingAnimation(renderer, true, false);
    expect(renderer.hasAttribute('animated')).toBe(false);
    applyPagingAnimation(renderer, false, true);
    expect(renderer.hasAttribute('animated')).toBe(false);
  });
});
