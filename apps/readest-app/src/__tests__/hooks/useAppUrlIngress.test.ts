import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

let openUrlHandler: ((urls: string[]) => void) | null = null;

vi.mock('@tauri-apps/plugin-deep-link', () => ({
  onOpenUrl: async (handler: (urls: string[]) => void) => {
    openUrlHandler = handler;
    return () => {};
  },
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ listen: async () => () => {} }),
}));
vi.mock('@tauri-apps/api/core', () => ({ addPluginListener: vi.fn() }));
vi.mock('@/services/environment', async (orig) => {
  const actual = await orig<typeof import('@/services/environment')>();
  return { ...actual, isTauriAppPlatform: () => true };
});
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: {} }) }));

import { useAppUrlIngress } from '@/hooks/useAppUrlIngress';
import { eventDispatcher } from '@/utils/event';

describe('useAppUrlIngress', () => {
  beforeEach(() => {
    openUrlHandler = null;
  });

  it('keeps AmpleRead sign-in callbacks away from the book-import consumers', () => {
    const dispatch = vi.spyOn(eventDispatcher, 'dispatch').mockResolvedValue(undefined);
    renderHook(() => useAppUrlIngress());
    expect(openUrlHandler).toBeTypeOf('function');

    openUrlHandler!(['ampleread://auth/callback?req=r1&code=c1']);
    expect(dispatch).not.toHaveBeenCalled();

    openUrlHandler!(['AmpleRead://auth/callback?req=r1&code=c1', 'file:///tmp/book.epub']);
    expect(dispatch).toHaveBeenCalledWith('app-incoming-url', {
      urls: ['file:///tmp/book.epub'],
      action: undefined,
    });
  });
});
