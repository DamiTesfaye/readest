import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ getSession: vi.fn(), amplereadFetch: vi.fn() }));
const install = vi.hoisted(() => ({ installFetch: vi.fn() }));

vi.mock('@/services/ampleread', () => ({
  getApiBase: () => 'https://api.test',
  installFetch: install.installFetch,
}));
vi.mock('@/services/ampleread/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/ampleread/auth/session')>()),
  getSession: session.getSession,
  amplereadFetch: session.amplereadFetch,
}));

import { createEngagement, engagement } from '@/services/margins/public/engagement';

const send = vi.fn(async (_events: { postId: string; kind: string }[]) => {});
let e: ReturnType<typeof createEngagement>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  e = createEngagement(send);
});
afterEach(() => {
  e.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createEngagement', () => {
  it('sends a batch as soon as it holds 50 events', async () => {
    for (let i = 0; i < 51; i++) e.count(`pst_${i}`, 'view');
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toHaveLength(50);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![0]).toEqual([{ postId: 'pst_50', kind: 'view' }]);
  });

  it('sends what it holds every 10 seconds', async () => {
    e.count('pst_1', 'view');
    await vi.advanceTimersByTimeAsync(9_999);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledWith([{ postId: 'pst_1', kind: 'view' }]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('sends on pagehide and when the page is hidden', async () => {
    e.count('pst_1', 'view');
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    e.count('pst_2', 'view');
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('counts each post and kind once per session', async () => {
    e.count('pst_1', 'view');
    e.count('pst_1', 'view');
    e.count('pst_1', 'replay');
    await e.flush();
    e.count('pst_1', 'view');
    await e.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toEqual([
      { postId: 'pst_1', kind: 'view' },
      { postId: 'pst_1', kind: 'replay' },
    ]);
  });

  it('drops a failed batch with one warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    send.mockRejectedValueOnce(new Error('offline'));
    e.count('pst_1', 'view');
    await e.flush();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Margins: events failed');
    e.count('pst_2', 'view');
    await e.flush();
    expect(send.mock.calls[1]![0]).toEqual([{ postId: 'pst_2', kind: 'view' }]);
  });

  it('stops listening once disposed', async () => {
    e.count('pst_1', 'view');
    e.dispose();
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('engagement', () => {
  it('posts events signed in', async () => {
    session.getSession.mockResolvedValue({ me: { id: 'usr_1' } });
    session.amplereadFetch.mockResolvedValue(new Response('{"counted":1}', { status: 200 }));
    engagement.count('pst_9', 'get_book');
    await engagement.flush();
    const [path, init] = session.amplereadFetch.mock.calls[0]! as [string, RequestInit];
    expect(path).toBe('/v1/feed/events');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      events: [{ postId: 'pst_9', kind: 'get_book' }],
    });
  });

  it('sends nothing signed out', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    session.getSession.mockResolvedValue(null);
    engagement.count('pst_10', 'view');
    await engagement.flush();
    expect(session.amplereadFetch).not.toHaveBeenCalled();
    expect(install.installFetch).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});
