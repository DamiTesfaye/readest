import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import {
  canDownloadEdition,
  flushEvents,
  getDownloadUrl,
  getExplore,
  getWorkDetail,
  isNotFoundError,
  refresh,
  trackEvent,
} from '@/services/ampleread';
import { isTauriAppPlatform } from '@/services/environment';
import { invoke } from '@tauri-apps/api/core';
import type { EditionView, ExploreResponse, WorkDetail } from '@/services/ampleread/types';

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

const edition = (assets: EditionView['assets'], canDownload: boolean): EditionView => ({
  id: 'ed_1',
  sourceName: 'gutenberg',
  language: 'en',
  mediaType: 'audio',
  assets,
  capabilities: { canRead: false, canDownload, canTransform: false },
  attribution: null,
});

describe('isNotFoundError', () => {
  test('recognises the engine NotFound error surfaced through Tauri', () => {
    expect(isNotFoundError(new Error('not found: work wk_1'))).toBe(true);
    expect(isNotFoundError(new Error('work detail not found for id wk_1'))).toBe(true);
  });

  test('recognises a 404 from the web passthrough', () => {
    expect(isNotFoundError(new Error('AmpleRead request failed: 404 /v1/works/wk_1'))).toBe(true);
  });

  test('is false for other failures and non-errors', () => {
    expect(isNotFoundError(new Error('http error: 500'))).toBe(false);
    expect(isNotFoundError(new Error('protocol error: bad json'))).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
    expect(isNotFoundError('not found')).toBe(true);
  });
});

describe('canDownloadEdition', () => {
  test('is false for a zero-asset edition even when the server says canDownload', () => {
    expect(canDownloadEdition(edition([], true))).toBe(false);
  });

  test('is true when the edition has at least one asset', () => {
    expect(canDownloadEdition(edition([{ id: 'as_1', kind: 'mp3', bytes: null }], true))).toBe(
      true,
    );
  });

  test('is false when the server forbids download despite assets', () => {
    expect(canDownloadEdition(edition([{ id: 'as_1', kind: 'mp3', bytes: null }], false))).toBe(
      false,
    );
  });
});

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

  test('trackEvent invokes ampleread_track_event with the event fields', async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await trackEvent({ kind: 'open', workId: 'work_1', editionId: 'ed_1' });

    expect(mockInvoke).toHaveBeenCalledWith('ampleread_track_event', {
      kind: 'open',
      workId: 'work_1',
      editionId: 'ed_1',
      props: undefined,
    });
  });

  test('flushEvents invokes ampleread_flush_events and returns the accepted count', async () => {
    mockInvoke.mockResolvedValueOnce(3);

    await expect(flushEvents()).resolves.toBe(3);

    expect(mockInvoke).toHaveBeenCalledWith('ampleread_flush_events', undefined);
  });

  test('getDownloadUrl invokes ampleread_download_url with work and asset ids', async () => {
    mockInvoke.mockResolvedValueOnce('https://files.example/1.epub');

    const url = await getDownloadUrl('work_1', 'as_1');

    expect(mockInvoke).toHaveBeenCalledWith('ampleread_download_url', {
      workId: 'work_1',
      assetId: 'as_1',
    });
    expect(url).toBe('https://files.example/1.epub');
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

  test('trackEvent and flushEvents are no-ops without an install token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await trackEvent({ kind: 'open', workId: 'work_1' });
    await expect(flushEvents()).resolves.toBe(0);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  test('getDownloadUrl returns the download route for the browser to follow', async () => {
    const url = await getDownloadUrl('work_1', 'as_1');

    expect(url).toBe('https://api.ampleread.com/v1/assets/as_1/download');
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
