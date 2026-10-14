import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMetadata } from '@/app/m/page';

const CARD = 'https://cdn.test/margins/cards/abc.jpg';
const live = (over: Record<string, unknown> = {}) => ({
  id: 'pst_1',
  status: 'live',
  author: { handle: 'reader_1', displayName: 'Reader One' },
  quote: 'Waste no more time arguing what a good man should be. Be one.',
  payload: { v: 1, elements: [] },
  cardUrl: CARD,
  book: { title: 'Meditations', author: 'Marcus Aurelius', workId: null, capped: false },
  ...over,
});

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

const meta = (id?: string) => generateMetadata({ searchParams: Promise.resolve(id ? { id } : {}) });

beforeEach(() => vi.stubEnv('NEXT_PUBLIC_APP_PLATFORM', 'web'));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('/m generateMetadata', () => {
  it('previews a live post with its card', async () => {
    const fetchMock = respond(200, live());
    vi.stubGlobal('fetch', fetchMock);
    const m = await meta('pst_1');
    expect(m.title).toBe('@reader_1 on Meditations');
    expect(m.openGraph?.description).toBe(live().quote);
    const images = m.openGraph?.images as { url: string; width: number; height: number }[];
    expect(images[0]).toEqual({ url: CARD, width: 1200, height: 630 });
    expect(images[0]!.url.endsWith('.jpg')).toBe(true);
    expect((m.twitter as { card: string }).card).toBe('summary_large_image');
    expect(m.robots).toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith('/v1/posts/pst_1')).toBe(true);
    expect(init.cache).toBe('no-store');
  });

  it('cuts the description at 120 scalars, not UTF-16 units', async () => {
    vi.stubGlobal('fetch', respond(200, live({ quote: '𝒜'.repeat(130) })));
    const m = await meta('pst_1');
    expect(m.openGraph?.description).toBe('𝒜'.repeat(120));
  });

  it('describes the post by its note first', async () => {
    const payload = { v: 1, elements: [{ id: 'n', kind: 'note', text: 'A note', frame: {} }] };
    vi.stubGlobal('fetch', respond(200, live({ payload })));
    expect((await meta('pst_1')).openGraph?.description).toBe('A note');
  });

  it('describes a shape post with no note by its citation', async () => {
    const citation = { publisher: 'Gutenberg', year: 2001, page: '16', percent: 9 };
    vi.stubGlobal('fetch', respond(200, live({ quote: null, display: 'shape', citation })));
    const m = await meta('pst_1');
    expect(m.openGraph?.description).toBe(
      'Meditations · Marcus Aurelius · Gutenberg, 2001 ed. · p. 16',
    );
    const images = m.openGraph?.images as { url: string }[];
    expect(images.map((i) => i.url)).toEqual([CARD]);
  });

  it('cuts the book title to 200 scalars', async () => {
    const title = '𝒜'.repeat(250);
    vi.stubGlobal('fetch', respond(200, live({ book: { ...live().book, title } })));
    expect((await meta('pst_1')).title).toBe(`@reader_1 on ${'𝒜'.repeat(200)}`);
  });

  it('marks a hidden post under review and unindexed', async () => {
    vi.stubGlobal('fetch', respond(200, { id: 'pst_1', status: 'hidden' }));
    const m = await meta('pst_1');
    expect(m.title).toBe('Under review · AmpleRead');
    expect(m.robots).toEqual({ index: false });
  });

  it('marks a gone post unavailable and unindexed', async () => {
    vi.stubGlobal('fetch', respond(410, { error: 'gone' }));
    const m = await meta('pst_1');
    expect(m.title).toBe('This Margin is no longer available');
    expect(m.robots).toEqual({ index: false });
  });

  it('returns a static title without fetching outside the web build', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_PLATFORM', 'tauri');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await meta('pst_1')).title).toBe('Open in AmpleRead');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
