import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useUIAnimationsEnabled } from '@/hooks/useUIAnimationsEnabled';
import { useSettingsStore } from '@/store/settingsStore';
import type { SystemSettings } from '@/types/settings';

let osReducesMotion = false;
const listeners = new Set<() => void>();

const setOsReducesMotion = (value: boolean) => {
  osReducesMotion = value;
  listeners.forEach((listener) => listener());
};

const setPreference = (uiAnimationsEnabled: boolean | undefined) => {
  useSettingsStore.setState({ settings: { uiAnimationsEnabled } as SystemSettings });
};

beforeEach(() => {
  osReducesMotion = false;
  listeners.clear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return osReducesMotion;
      },
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  setPreference(undefined);
});

describe('useUIAnimationsEnabled', () => {
  it('follows the OS reduce motion preference while unset', () => {
    setPreference(undefined);
    const { result } = renderHook(() => useUIAnimationsEnabled());
    expect(result.current).toBe(true);
    act(() => setOsReducesMotion(true));
    expect(result.current).toBe(false);
  });

  it('lets an explicit user choice override the OS preference', () => {
    osReducesMotion = true;
    setPreference(true);
    const { result } = renderHook(() => useUIAnimationsEnabled());
    expect(result.current).toBe(true);
    act(() => setPreference(false));
    expect(result.current).toBe(false);
  });
});
