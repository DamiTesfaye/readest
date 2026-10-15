import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostView, QueueItem } from '@/services/margins/public/api';

const h = vi.hoisted(() => ({
  session: { value: { accessToken: 'a' } as unknown },
  fetch: vi.fn(),
  asset: vi.fn(async (postId: string, ref: string) => `blob:${postId}/${ref}`),
  card: vi.fn(),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, opts?: Record<string, string | number>) =>
    opts ? s.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(opts[key] ?? '')) : s,
}));
vi.mock('@/services/ampleread/auth/session', async (orig) => ({
  ...(await orig<typeof import('@/services/ampleread/auth/session')>()),
  getSession: async () => h.session.value,
  amplereadFetch: h.fetch,
}));
vi.mock('@/services/margins/public/api', async (orig) => {
  const real = await orig<typeof import('@/services/margins/public/api')>();
  return { ...real, publicApi: { ...real.publicApi, postAssetUrl: h.asset } };
});
vi.mock('@/app/reader/components/margins/PostCard', () => ({
  default: (props: { post: PostView }) => {
    h.card(props);
    return <article>{props.post.quote}</article>;
  },
}));

import ModerationQueue from '@/app/admin/moderation/ModerationQueue';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const item = (postId: string, over: Partial<QueueItem> = {}): QueueItem => ({
  kind: 'report',
  post: { id: postId, quote: `quote ${postId}`, author: { handle: 'maker' } } as PostView,
  postId,
  status: 'live',
  cardAsset: `ast_card_${postId}`,
  reports: [{ reason: 'spam', text: 'bad', established: true, createdAt: '2026-10-01T00:00:00Z' }],
  notices: [],
  appeal: null,
  creator: { handle: 'maker', posts: 4, upheldReports: 1, accountAgeDays: 12, suspensions: 2 },
  text: { title: 'Meditations', titleVerified: false, capped: true, license: null },
  createdAt: '2026-10-01T00:00:00Z',
  ...over,
});

const show = async () => {
  render(<ModerationQueue />);
  await act(async () => {});
};

const queueCalls = () => h.fetch.mock.calls.filter(([p]) => p === '/v1/admin/queue');
const region = (postId: string) => screen.getByRole('region', { name: postId });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_PLATFORM', 'web');
  h.session.value = { accessToken: 'a' };
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('ModerationQueue', () => {
  it.each([404, 401])('shows only "Not available." on %i', async (status) => {
    h.fetch.mockResolvedValue(json(status, { error: 'not_found' }));
    await show();
    screen.getByText('Not available.');
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByText(/Dismiss|Reports|Queue/)).toBeNull();
  });

  it('does not fetch the queue signed out', async () => {
    h.session.value = null;
    await show();
    screen.getByText('Not available.');
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('does not fetch outside the web build', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_PLATFORM', 'tauri');
    await show();
    screen.getByText('Not available.');
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it('renders items in server order with reports, history, rights and art', async () => {
    h.fetch.mockResolvedValue(json(200, [item('pst_b'), item('pst_a')]));
    await show();
    const regions = screen.getAllByRole('region');
    expect(regions.map((r) => r.getAttribute('aria-label'))).toEqual(['pst_b', 'pst_a']);
    const b = within(region('pst_b'));
    b.getByText('quote pst_b');
    expect(h.card).toHaveBeenCalledWith(expect.objectContaining({ signedIn: false }));
    b.getByText(/spam/);
    b.getByText(/bad/);
    b.getByText('@maker · 4 posts · 1 upheld reports · 12 days old · 2 suspensions');
    b.getByText('Meditations (unverified) · capped');
    expect(h.asset).toHaveBeenCalledWith('pst_b', 'ast_card_pst_b');
    expect(b.getByRole('img', { name: 'Preview card' }).getAttribute('src')).toBe(
      'blob:pst_b/ast_card_pst_b',
    );
  });

  it('shows a CSAM item as ids and times only, with one action', async () => {
    const csam = item('pst_c', { kind: 'csam', post: null, cardAsset: null, reports: [] });
    h.fetch.mockResolvedValue(json(200, [csam]));
    await show();
    const c = within(region('pst_c'));
    c.getByText(/pst_c/);
    c.getByText(/@maker/);
    c.getByText(/2026-10-01T00:00:00Z/);
    expect(h.card).not.toHaveBeenCalled();
    expect(h.asset).not.toHaveBeenCalled();
    expect(c.queryByRole('img')).toBeNull();
    expect(c.getAllByRole('button').map((b) => b.textContent)).toEqual(['Mark reported']);
  });

  it('shows notices with the claimant and the counter-notice', async () => {
    const counter = { name: 'Cee', email: 'cee@example.com', phone: '555', statement: 'Mine' };
    const notice = item('pst_n', {
      kind: 'notice',
      notices: [
        {
          id: 'cpn_1',
          work: 'A Book',
          claimantName: 'Ada',
          claimantEmail: 'ada@example.com',
          state: 'countered',
          restoreAfter: null,
          counter,
        },
      ],
    });
    h.fetch.mockResolvedValue(json(200, [notice]));
    await show();
    const n = within(region('pst_n'));
    n.getByText(/Ada/);
    n.getByText(/ada@example\.com/);
    n.getByText(/A Book/);
    n.getByText(/cee@example\.com/);
    n.getByText(/Mine/);
    n.getByRole('button', { name: 'Court action' });
    n.getByRole('button', { name: 'Counter-notice forwarded' });
  });

  it('hides Counter-notice forwarded once the clock started', async () => {
    const notice = item('pst_n', {
      kind: 'notice',
      notices: [
        {
          id: 'cpn_1',
          work: 'W',
          claimantName: 'Ada',
          claimantEmail: 'a@b.co',
          state: 'countered',
          restoreAfter: '2026-10-20T00:00:00Z',
          counter: { name: 'Cee' },
        },
      ],
    });
    h.fetch.mockResolvedValue(json(200, [notice]));
    await show();
    expect(
      within(region('pst_n')).queryByRole('button', { name: 'Counter-notice forwarded' }),
    ).toBeNull();
  });

  it('offers Deny appeal on an appeal item and every general action', async () => {
    h.fetch.mockResolvedValue(json(200, [item('pst_p', { kind: 'appeal', appeal: 'Please' })]));
    await show();
    const p = within(region('pst_p'));
    p.getByText(/Please/);
    for (const name of [
      'Dismiss',
      'Hide',
      'Remove',
      'Remove and suspend 7 days',
      'Remove and suspend 30 days',
      'Remove and suspend permanently',
      'Restore',
      'Deny appeal',
      'Lift suspension',
      'Reset profile',
    ])
      p.getByRole('button', { name });
    expect(p.queryByRole('button', { name: 'Court action' })).toBeNull();
    expect(p.queryByRole('button', { name: 'Mark reported' })).toBeNull();
  });

  it('posts an action, replaces the item, then drops it when it leaves', async () => {
    h.fetch
      .mockResolvedValueOnce(json(200, [item('pst_a'), item('pst_b')]))
      .mockResolvedValueOnce(json(200, item('pst_a', { status: 'hidden', reports: [] })))
      .mockResolvedValueOnce(json(200, item('pst_a', { kind: 'none' })));
    await show();
    await act(async () =>
      fireEvent.click(within(region('pst_a')).getByRole('button', { name: 'Hide' })),
    );
    const [path, init] = h.fetch.mock.calls[1]!;
    expect(path).toBe('/v1/admin/posts/pst_a/actions');
    expect(JSON.parse(init.body)).toEqual({ action: 'hide' });
    within(region('pst_a')).getByText(/hidden/);
    await act(async () =>
      fireEvent.click(
        within(region('pst_a')).getByRole('button', { name: 'Remove and suspend 30 days' }),
      ),
    );
    expect(JSON.parse(h.fetch.mock.calls[2]![1].body)).toEqual({
      action: 'remove_suspend',
      days: 30,
    });
    expect(screen.queryByRole('region', { name: 'pst_a' })).toBeNull();
    region('pst_b');
    expect(queueCalls()).toHaveLength(1);
  });

  it('sends a permanent suspension as days null', async () => {
    h.fetch
      .mockResolvedValueOnce(json(200, [item('pst_a')]))
      .mockResolvedValueOnce(json(200, item('pst_a', { kind: 'none' })));
    await show();
    await act(async () =>
      fireEvent.click(screen.getByRole('button', { name: 'Remove and suspend permanently' })),
    );
    expect(JSON.parse(h.fetch.mock.calls[1]![1].body)).toEqual({
      action: 'remove_suspend',
      days: null,
    });
  });

  it('explains a restore refused by the crowd cap', async () => {
    h.fetch
      .mockResolvedValueOnce(json(200, [item('pst_a', { status: 'removed' })]))
      .mockResolvedValueOnce(json(409, { error: 'crowd_cap_reached' }));
    await show();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Restore' })));
    within(region('pst_a')).getByText("Restoring would go over this book's public quote limit.");
  });
});
