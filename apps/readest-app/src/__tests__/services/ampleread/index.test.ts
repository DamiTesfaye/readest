import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { getExplore, getWorkDetail, refresh } from '@/services/ampleread';
import { isTauriAppPlatform } from '@/services/environment';
import { invoke } from '@tauri-apps/api/core';
import type { ExploreResponse, WorkDetail } from '@/services/ampleread/types';

const mockIsTauriAppPlatform = vi.mocked(isTauriAppPlatform);
const mockInvoke = vi.mocked(invoke);

const env = process.env as Record<string, string | undefined>;
const originalApiBase = env['NEXT_PUBLIC_AMPLEREAD_API_BASE'];

beforeEach(() => {
  vi.clearAllMocks();
  delete env['NEXT_PUBLIC_AMPLEREAD_API_BASE'];
});

afterEach(() => {
  if (originalApiBase === undefined) {
    delete env['NEXT_PUBLIC_AMPLEREAD_API_BASE'];
  } else {
    env['NEXT_PUBLIC_AMPLEREAD_API_BASE'] = originalApiBase;
  }
  vi.unstubAllGlobals();
});

const sampleExplore: ExploreResponse = { shelves: [] };
const sampleWorkDetail: WorkDetail = {
  id: 'work-1',
  title: 'A Book',
  description: null,
  subjects: [],
  preferredEditionId: null,
  editions: [],
};

describe('ampleread service on tauri platform', () => {
  beforeEach(() => {
    mockIsTauriAppPlatform.mockReturnValue(true);
  });

  test('getExplore invokes the ampleread_explore command', async () => {
    mockInvoke.mockResolvedValueOnce(sampleExplore);

    const result = await getExplore();

    expect(mockInvoke).toHaveBeenCalledWith('ampleread_explore', undefined);
    expect(result).toEqual(sampleExplore);
  });

  test('getWorkDetail invokes the ampleread_work_detail command with the id', async () => {
    mockInvoke.mockResolvedValueOnce(sampleWorkDetail);

    const result = await getWorkDetail('work-1');

    expect(mockInvoke).toHaveBeenCalledWith('ampleread_work_detail', { id: 'work-1' });
    expect(result).toEqual(sampleWorkDetail);
  });

  test('refresh invokes the ampleread_refresh command with the scope', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await refresh('explore');

    expect(mockInvoke).toHaveBeenCalledWith('ampleread_refresh', { scope: 'explore' });
  });
});

describe('ampleread service on web platform', () => {
  beforeEach(() => {
    mockIsTauriAppPlatform.mockReturnValue(false);
  });

  test('getExplore fetches from the default API base and never touches invoke', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleExplore,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getExplore();

    expect(fetchMock).toHaveBeenCalledWith('https://api.ampleread.com/v1/explore');
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(result).toEqual(sampleExplore);
  });

  test('getExplore uses NEXT_PUBLIC_AMPLEREAD_API_BASE when set', async () => {
    env['NEXT_PUBLIC_AMPLEREAD_API_BASE'] = 'https://staging.example.com';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleExplore,
    });
    vi.stubGlobal('fetch', fetchMock);

    await getExplore();

    expect(fetchMock).toHaveBeenCalledWith('https://staging.example.com/v1/explore');
  });

  test('getWorkDetail fetches the work path by id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleWorkDetail,
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getWorkDetail('work-1');

    expect(fetchMock).toHaveBeenCalledWith('https://api.ampleread.com/v1/works/work-1');
    expect(result).toEqual(sampleWorkDetail);
  });

  test('getExplore throws when the response is not ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(getExplore()).rejects.toThrow('503');
  });

  test('refresh is a no-op passthrough and never touches invoke or fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await refresh('explore');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
