import { describe, it, expect, vi, beforeEach } from 'vitest';

import { closeOPDSBrowser } from '@/app/opds/utils/opdsClose';

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      setRequestedPanel: vi.fn(),
      setRequestedSubPage: vi.fn(),
      setSettingsDialogOpen: vi.fn(),
    }),
  },
}));

const makeRouter = () => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
});

const makeParams = (query: string) =>
  new URLSearchParams(query) as unknown as Parameters<typeof closeOPDSBrowser>[1];

describe('closeOPDSBrowser', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('returns to the library catalogs view when the browser was entered from it', () => {
    const router = makeRouter();
    closeOPDSBrowser(
      router as unknown as Parameters<typeof closeOPDSBrowser>[0],
      makeParams('url=https%3A%2F%2Fexample.com%2Fopds&from=library-catalogs'),
    );
    expect(router.replace).toHaveBeenCalledWith('/library?catalogs=true', undefined);
  });

  it('falls back to reopening the library OPDS dialog for dialog-entered browsers', () => {
    const router = makeRouter();
    closeOPDSBrowser(
      router as unknown as Parameters<typeof closeOPDSBrowser>[0],
      makeParams('url=https%3A%2F%2Fexample.com%2Fopds'),
    );
    expect(router.replace).toHaveBeenCalledWith('/library?opds=true', {});
  });
});
