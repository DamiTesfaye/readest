import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page, Route } from '@playwright/test';
import { expect, test } from '../fixtures/base';

const API = process.env['NEXT_PUBLIC_AMPLEREAD_API_BASE'] ?? 'https://api.ampleread.com';
const FIXTURES = join(process.cwd(), 'e2e/fixtures/margins');
const PIXEL = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=', 'base64');
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};
const LATER = '2099-01-01T00:00:00Z';

const bootstrap = JSON.parse(readFileSync(join(FIXTURES, 'bootstrap.json'), 'utf8'));

const SESSION = {
  tokens: {
    accessToken: 'at_e2e',
    refreshToken: 'rt_e2e',
    tokenType: 'Bearer',
    accessExpiresAt: LATER,
    refreshExpiresAt: '2099-02-01T00:00:00Z',
  },
  me: {
    id: 'usr_e2e',
    email: 'reader@example.com',
    displayName: 'E2E Reader',
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00Z',
    identities: [],
  },
};

const CREATORS: Record<string, string> = {
  creator_b: 'Creator B',
  creator_c: 'Creator C',
};

const post = (id: string, handle: string, createdAt: string) => ({
  id,
  layerId: null,
  author: { handle, displayName: CREATORS[handle] },
  textId: `txt_${handle}`,
  version: 1,
  section: 0,
  sectionLen: 400,
  start: 0,
  end: 40,
  quote: null,
  anchor: { textId: `txt_${handle}`, kind: 'span', quote: null, context: null, hint: {}, v: 1 },
  payload: { v: 1, ground: 'paper', quote: { frame: {}, size: 'm' }, elements: [] },
  cardUrl: null,
  language: 'en',
  status: 'live',
  book: {
    title: 'Meditations',
    author: 'Marcus Aurelius',
    workId: null,
    capped: true,
    findUrl: null,
  },
  mine: false,
  display: 'art',
  citation: { percent: 5 },
  sceneAsset: null,
  coverAsset: null,
  feedEligible: true,
  following: false,
  createdAt,
  updatedAt: createdAt,
});

const mockApi = async (page: Page) => {
  const state = {
    follows: new Set<string>(),
    blocks: new Set<string>(),
    posts: [
      post('pst_b1', 'creator_b', '2026-10-01T00:00:00Z'),
      post('pst_c1', 'creator_c', '2026-10-02T00:00:00Z'),
      post('pst_b0', 'creator_b', '2026-09-01T00:00:00Z'),
    ],
    followedFrom: [] as (string | null)[],
  };
  const visible = () => state.posts.filter((p) => !state.blocks.has(p.author.handle));
  const view = (p: ReturnType<typeof post>) => ({
    ...p,
    following: state.follows.has(p.author.handle),
  });
  const reply = (route: Route, init: Parameters<Route['fulfill']>[0]) =>
    route.fulfill({ ...init, headers: { ...CORS, ...init?.headers } });
  const empty = (route: Route) => reply(route, { status: 204 });

  await page.route(`${API}/**`, (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    if (method === 'OPTIONS') return empty(route);
    if (path === '/v1/bootstrap') return reply(route, { json: bootstrap });
    if (path === '/v1/feed/for-you')
      return reply(route, { json: { posts: visible().map(view), nextCursor: null } });
    if (path === '/v1/feed/following') {
      const posts = visible()
        .filter((p) => state.follows.has(p.author.handle))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return reply(route, { json: { posts: posts.map(view), nextCursor: null } });
    }
    if (path === '/v1/feed/trending')
      return reply(route, { json: { posts: [], nextCursor: null } });
    if (path === '/v1/me/posts') return reply(route, { json: [] });
    if (path === '/v1/feed/events') return reply(route, { json: { counted: 0 } });
    const follow = path.match(/^\/v1\/follows\/(\w+)$/);
    if (follow && method === 'PUT') {
      state.follows.add(follow[1]!);
      state.followedFrom.push(url.searchParams.get('post'));
      return empty(route);
    }
    if (follow && method === 'DELETE') {
      state.follows.delete(follow[1]!);
      return empty(route);
    }
    if (path === '/v1/me/blocks')
      return reply(route, {
        json: [...state.blocks].map((handle) => ({ handle, displayName: CREATORS[handle] })),
      });
    const block = path.match(/^\/v1\/me\/blocks\/(\w+)$/);
    if (block && method === 'PUT') {
      state.blocks.add(block[1]!);
      state.follows.delete(block[1]!);
      return empty(route);
    }
    if (block && method === 'DELETE') {
      state.blocks.delete(block[1]!);
      return empty(route);
    }
    if (path === '/v1/me/hidden-books') return reply(route, { json: [] });
    if (path.includes('/assets/')) return reply(route, { body: PIXEL, contentType: 'image/webp' });
    return reply(route, { status: 404, json: { error: 'not_found', message: 'Not found' } });
  });
  return state;
};

const signIn = (page: Page) =>
  page.addInitScript((session) => {
    window.localStorage.setItem('ampleread-session', JSON.stringify(session));
  }, SESSION);

test('follows a creator into Following, then blocks and unblocks them', async ({ page }) => {
  test.setTimeout(120_000);
  const state = await mockApi(page);
  await signIn(page);
  await page.goto('/library?feed=for-you');

  const forYou = page.getByRole('feed', { name: 'Margins' });
  const cards = forYou.getByRole('article');
  await expect(cards).toHaveCount(3);
  const first = cards.filter({ hasText: '@creator_b' }).first();
  await first.getByRole('button', { name: 'Follow' }).click();
  await expect(first.getByRole('button', { name: 'Following' })).toBeVisible();
  expect(state.follows.has('creator_b')).toBe(true);
  expect(state.followedFrom).toEqual(['pst_b1']);

  state.posts.unshift(post('pst_b2', 'creator_b', '2026-10-10T00:00:00Z'));
  await page.getByRole('tab', { name: 'Following' }).click();
  const following = page.getByRole('feed', { name: 'Margins' }).last();
  await expect(following.getByRole('article')).toHaveCount(3);
  await expect(following.getByRole('article').first()).toHaveAttribute('aria-posinset', '1');
  await expect(following.getByRole('article').first().getByText('@creator_b')).toBeVisible();
  await expect(following.getByRole('article').filter({ hasText: '@creator_c' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'For You' }).click();
  await first.getByRole('button', { name: 'More' }).click();
  await first.getByRole('button', { name: 'Block @creator_b' }).click();
  const confirm = page.getByRole('dialog', { name: 'Block @creator_b' });
  await expect(confirm).toContainText("You won't see each other's Margins.");
  await confirm.getByRole('button', { name: 'Block' }).click();
  await expect(cards.filter({ hasText: '@creator_b' })).toHaveCount(0);
  await expect(cards).toHaveCount(1);

  await page.reload();
  await expect(page.getByRole('feed', { name: 'Margins' }).getByRole('article')).toHaveCount(1);
  await expect(page.getByText('@creator_b')).toHaveCount(0);

  await page.goto('/library');
  await page.getByRole('button', { name: 'Account Menu' }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Integrations' }).click();
  await page.getByText('AmpleRead account').click();
  const blocked = page.getByRole('list', { name: 'Blocked accounts' });
  await expect(blocked.getByText('@creator_b')).toBeVisible();
  await blocked.getByRole('button', { name: 'Unblock @creator_b' }).click();
  await expect(page.getByText("You haven't blocked anyone")).toBeVisible();
  expect(state.blocks.size).toBe(0);
});
