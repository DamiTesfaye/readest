import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Page, Route } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { ReaderPage } from '../pages/ReaderPage';

const API = process.env['NEXT_PUBLIC_AMPLEREAD_API_BASE'] ?? 'https://api.ampleread.com';
const FIXTURES = join(process.cwd(), 'e2e/fixtures/margins');
const TEXT_ID = 'txt_e2e_alice';
const SCENE_MIME = 'application/vnd.ampleread.scene+gzip';
const SCENE_END = 400;
const MIN_SECTION = 200;
const PIXEL = Buffer.from('UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=', 'base64');
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};

const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));

const golden = fixture('scene-meditations.json');
const scene = gzipSync(
  JSON.stringify({
    ...golden,
    events: golden.events.filter(([step]: number[]) => step! <= SCENE_END),
    checkpoints: [],
    cover_step: SCENE_END / 2,
  }),
);

const feedPage = (lengths: number[]) => {
  const section = lengths.findIndex((n) => n >= MIN_SECTION);
  const at = new Date(0).toISOString();
  return {
    nextCursor: null,
    posts: fixture('feed-page.json').map((post: object, i: number) => ({
      ...post,
      textId: TEXT_ID,
      version: 1,
      section,
      sectionLen: lengths[section],
      start: 20 + 10 * i,
      end: 60 + 10 * i,
      quote: null,
      anchor: {
        textId: TEXT_ID,
        kind: 'span',
        quote: null,
        context: null,
        hint: { position: 0, file: null },
        v: 1,
      },
      cardUrl: null,
      language: 'en',
      status: 'live',
      book: {
        title: "Alice's Adventures in Wonderland",
        author: 'Lewis Carroll',
        workId: null,
        capped: true,
        findUrl: null,
      },
      mine: false,
      citation: { percent: 5 },
      feedEligible: true,
      following: false,
      createdAt: at,
      updatedAt: at,
    })),
  };
};

const mockApi = async (page: Page) => {
  const seen: { lengths: number[] | null } = { lengths: null };
  const reply = (route: Route, init: Parameters<Route['fulfill']>[0]) =>
    route.fulfill({ ...init, headers: { ...CORS, ...init?.headers } });
  await page.route(`${API}/**`, (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return reply(route, { status: 204 });
    if (path === '/v1/bootstrap') return reply(route, { json: fixture('bootstrap.json') });
    if (path === '/v1/texts/match') {
      seen.lengths = request.postDataJSON().sectionLengths;
      const match = { textId: TEXT_ID, familyId: TEXT_ID, relation: 'same', confidence: 1 };
      return reply(route, { json: { matches: [{ ...match, capped: true }] } });
    }
    if (path.endsWith('/post-counts')) return reply(route, { json: [] });
    if (path.endsWith('/passages')) return reply(route, { json: { posts: [], nextCursor: null } });
    if (path === '/v1/feed/trending')
      return reply(route, {
        json: seen.lengths ? feedPage(seen.lengths) : { posts: [], nextCursor: null },
      });
    if (path.endsWith('/assets/ast_scene'))
      return reply(route, { body: scene, contentType: SCENE_MIME });
    if (path.includes('/assets/')) return reply(route, { body: PIXEL, contentType: 'image/webp' });
    return reply(route, { status: 404, json: { error: 'not_found', message: 'Not found' } });
  });
  return seen;
};

test('swipes the feed, takes a turn and opens the book at the page', async ({ page, openBook }) => {
  test.setTimeout(120_000);
  const seen = await mockApi(page);
  await openBook();
  await expect.poll(() => seen.lengths).not.toBeNull();
  await page.goBack();

  await page.getByRole('button', { name: 'Feed' }).click();
  const feed = page.getByRole('feed', { name: 'Margins' });
  const cards = feed.getByRole('article');
  await expect(cards).toHaveCount(3);

  await feed.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(cards.nth(2)).toHaveAttribute('aria-current', 'true');

  await cards.nth(2).getByRole('button', { name: 'Unmute' }).click();
  await expect(cards.nth(2).getByRole('button', { name: 'Mute', exact: true })).toBeVisible();

  await page.keyboard.press('ArrowUp');
  const play = cards.nth(1);
  await expect(play).toHaveAttribute('aria-current', 'true');
  await expect(play.getByText('Your turn')).toBeVisible({ timeout: 30_000 });
  await play.getByRole('img', { name: /Words pushed aside/ }).click();
  await expect(play.getByText('Your turn')).toBeHidden();
  await expect(play.getByRole('button', { name: 'Restart' })).toBeVisible();

  await play.getByRole('button', { name: 'Get this book' }).click();
  await page.getByRole('button', { name: 'Open at this page' }).click();
  const reader = new ReaderPage(page);
  await reader.waitForReady();
  await expect(reader.viewInPlace.first()).toBeAttached({ timeout: 30_000 });
});
