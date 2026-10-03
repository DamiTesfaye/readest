import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const getDownloadSignedUrlMock = vi.fn();
const lookup = vi.fn();

vi.mock('@/utils/cors', () => ({
  corsAllMethods: {},
  runMiddleware: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/utils/access', () => ({
  validateUserAndToken: async () => ({ user: { id: 'u1' }, token: 'tok' }),
}));
vi.mock('@/utils/object', () => ({
  getDownloadSignedUrl: (...args: unknown[]) => getDownloadSignedUrlMock(...args),
}));
vi.mock('@/utils/supabase', () => ({
  createSupabaseAdminClient: () => {
    const builder: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in']) builder[method] = () => builder;
    builder['is'] = () => lookup();
    return { from: () => builder };
  },
}));

import { STORAGE_FILE_NOT_FOUND_ERROR } from '@/libs/errors';
import handler from '@/pages/api/storage/download';

const FILE_KEY = 'u1/Readest/Replicas/mindmap/m1/m1.json';

const call = async (method: 'GET' | 'POST') => {
  const req = {
    method,
    headers: { authorization: 'Bearer tok' },
    query: method === 'GET' ? { fileKey: FILE_KEY } : {},
    body: method === 'POST' ? { fileKeys: [FILE_KEY] } : undefined,
    url: `/api/storage/download?fileKey=${encodeURIComponent(FILE_KEY)}`,
  } as unknown as NextApiRequest;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as NextApiResponse;
  await handler(req, res);
  return {
    status: (res.status as ReturnType<typeof vi.fn>).mock.calls[0]?.[0],
    body: (res.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0],
  };
};

beforeEach(() => {
  getDownloadSignedUrlMock.mockReset().mockResolvedValue('https://r2/download');
  lookup.mockReset().mockResolvedValue({ data: [], error: null });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('/api/storage/download', () => {
  it('answers a file without a files row with the shared not-found error', async () => {
    expect(await call('GET')).toEqual({
      status: 404,
      body: { error: STORAGE_FILE_NOT_FOUND_ERROR },
    });
  });

  it('signs a file that has a files row', async () => {
    lookup.mockResolvedValue({
      data: [{ user_id: 'u1', file_key: FILE_KEY, book_hash: null }],
      error: null,
    });
    expect(await call('GET')).toEqual({
      status: 200,
      body: { downloadUrl: 'https://r2/download' },
    });
  });

  it.each([
    'GET',
    'POST',
  ] as const)('answers %s with a server error, not a missing file, when the files lookup fails', async (method) => {
    lookup.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const { status, body } = await call(method);
    expect(status).toBe(500);
    expect(body.error).not.toBe(STORAGE_FILE_NOT_FOUND_ERROR);
    expect(getDownloadSignedUrlMock).not.toHaveBeenCalled();
  });
});
