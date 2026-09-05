import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFlushEvents = vi.fn();
let isDesktopApp = false;

vi.mock('@/services/ampleread', () => ({
  flushEvents: (...args: unknown[]) => mockFlushEvents(...args),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService: { isDesktopApp } }),
}));

import { useAmpleReadEventFlush } from '@/hooks/useAmpleReadEventFlush';
import { eventDispatcher } from '@/utils/event';

const setVisibility = (state: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

describe('useAmpleReadEventFlush', () => {
  beforeEach(() => {
    isDesktopApp = false;
    mockFlushEvents.mockReset();
    mockFlushEvents.mockResolvedValue(0);
  });

  afterEach(() => {
    cleanup();
    setVisibility('visible');
  });

  it('flushes queued events when the page transitions to hidden', async () => {
    renderHook(() => useAmpleReadEventFlush());
    await act(async () => {});

    act(() => setVisibility('hidden'));

    await waitFor(() => expect(mockFlushEvents).toHaveBeenCalledTimes(1));
  });

  it('does not flush when the page becomes visible again', async () => {
    renderHook(() => useAmpleReadEventFlush());
    await act(async () => {});

    act(() => setVisibility('visible'));
    await act(async () => {});

    expect(mockFlushEvents).not.toHaveBeenCalled();
  });

  it('flushes when the app is asked to quit', async () => {
    renderHook(() => useAmpleReadEventFlush());
    await act(async () => {});

    await act(async () => {
      await eventDispatcher.dispatch('quit-app');
    });

    expect(mockFlushEvents).toHaveBeenCalledTimes(1);
  });

  it('stops listening after unmount', async () => {
    const { unmount } = renderHook(() => useAmpleReadEventFlush());
    await act(async () => {});
    unmount();

    act(() => setVisibility('hidden'));
    await eventDispatcher.dispatch('quit-app');

    expect(mockFlushEvents).not.toHaveBeenCalled();
  });

  it('swallows a flush failure so the lifecycle handlers never throw', async () => {
    mockFlushEvents.mockRejectedValue(new Error('offline'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderHook(() => useAmpleReadEventFlush());
    await act(async () => {});

    await act(async () => {
      await eventDispatcher.dispatch('quit-app');
    });

    expect(mockFlushEvents).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
