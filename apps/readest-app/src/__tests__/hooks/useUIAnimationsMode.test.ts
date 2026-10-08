import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUIAnimationsMode, useUIAnimationsRootSync } from '@/hooks/useUIAnimationsMode';
import { useSettingsStore } from '@/store/settingsStore';
import type { SystemSettings } from '@/types/settings';

afterEach(() => {
  document.documentElement.removeAttribute('data-ui-anim');
  useSettingsStore.setState({ settings: {} as SystemSettings });
  vi.unstubAllGlobals();
});

describe('useUIAnimationsRootSync', () => {
  it('keeps the root attribute in step with the user preference', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    useSettingsStore.setState({ settings: { uiAnimationsEnabled: false } as SystemSettings });
    renderHook(() => useUIAnimationsRootSync());
    expect(document.documentElement.getAttribute('data-ui-anim')).toBe('off');

    act(() => {
      useSettingsStore.setState({ settings: { uiAnimationsEnabled: true } as SystemSettings });
    });
    expect(document.documentElement.hasAttribute('data-ui-anim')).toBe(false);
  });
});

describe('useUIAnimationsMode', () => {
  it('sets data-ui-anim="off" on the root when disabled', () => {
    const { result } = renderHook(() => useUIAnimationsMode());
    result.current.applyUIAnimationsMode(false);
    expect(document.documentElement.getAttribute('data-ui-anim')).toBe('off');
  });

  it('removes the attribute when enabled', () => {
    const { result } = renderHook(() => useUIAnimationsMode());
    result.current.applyUIAnimationsMode(false);
    result.current.applyUIAnimationsMode(true);
    expect(document.documentElement.hasAttribute('data-ui-anim')).toBe(false);
  });
});
