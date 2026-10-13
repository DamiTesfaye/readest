import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeDatabaseService } from '@/services/database/nodeDatabaseService';
import { migrate } from '@/services/database/migrate';
import { getMigrations } from '@/services/database/migrations';
import { MarginsStore } from '@/services/margins/store';
import type { Anchor } from '@/services/margins/types';

const session = vi.hoisted(() => ({ getSession: vi.fn(), amplereadFetch: vi.fn() }));

vi.mock('@/services/ampleread', () => ({ installFetch: vi.fn() }));
vi.mock('@/services/ampleread/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/ampleread/auth/session')>()),
  getSession: session.getSession,
  amplereadFetch: session.amplereadFetch,
}));

import { addLocalAsset, assetUrl } from '@/services/margins/assets';
import { saveMargin } from '@/services/margins/margins';
import { emptyEnvelope, type Envelope } from '@/services/margins/payload';
import { flushOutbox } from '@/services/margins/sync';

const AST = `ast_${'a'.repeat(32)}`;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"/>';

const anchor: Anchor = {
  textId: 'txt_a',
  kind: 'span',
  quote: { exact: 'tired of sitting' },
  context: { prefixHash: 'p', suffixHash: 's', prefix: null, suffix: null },
  hint: { position: 0.1, file: { fileHash: 'hash-a', cfi: 'epubcfi(/6/2!/4/2,/1:0,/1:5)' } },
  v: 1,
};

const withArt = (asset: string): Envelope => ({
  ...emptyEnvelope(),
  elements: [
    {
      id: 'a1',
      kind: 'artwork',
      frame: { x: 0.5, y: 0.5, w: 0.5, r: 0 },
      asset,
      alt: 'A rabbit',
      source: 'drawing',
    },
  ],
});

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const server = (upload: () => Response) =>
  session.amplereadFetch.mockImplementation(async (path: string, init: RequestInit = {}) => {
    if (path === '/v1/layer-assets') return upload();
    const body = JSON.parse(init.body as string);
    return json(200, {
      ...body,
      textId: 'txt_a',
      rev: 1,
      createdAt: '2026-10-13T00:00:00Z',
      deletedAt: null,
    });
  });

const paths = () => session.amplereadFetch.mock.calls.map((c) => c[0]);

describe('margin assets', () => {
  let store: MarginsStore;
  beforeEach(async () => {
    const db = await NodeDatabaseService.open(':memory:');
    await migrate(db, getMigrations('margins'));
    store = MarginsStore.from(db);
    session.getSession.mockResolvedValue({ tokens: {}, me: { id: 'u1' } });
    session.amplereadFetch.mockReset();
    URL.createObjectURL = vi.fn(() => `blob:${Math.random()}`);
  });

  const drawing = () =>
    addLocalAsset(store, new Blob([SVG], { type: 'image/svg+xml' }), { width: 4, height: 4 });

  it('stores a drawing on the device', async () => {
    const ref = await drawing();
    expect(ref).toMatch(/^local:[0-9a-f-]{36}$/);
    const row = await store.getAsset(ref);
    expect(row).toMatchObject({ userId: 'u1', remoteId: null, mime: 'image/svg+xml', width: 4 });
    expect(atob(row!.data!)).toBe(SVG);
    expect(row!.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('uploads local assets before the POST and rewrites the refs', async () => {
    const ref = await drawing();
    const id = await saveMargin(store, { fileHash: 'hash-a', anchor, envelope: withArt(ref) });
    server(() => json(201, { id: AST, mime: 'image/svg+xml', width: 4, height: 4, bytes: 60 }));
    expect(await flushOutbox(store)).toBe(1);
    expect(paths()).toEqual(['/v1/layer-assets', '/v1/layers']);
    const [, upload] = session.amplereadFetch.mock.calls[0]!;
    expect(upload.method).toBe('POST');
    expect(new Headers(upload.headers).get('content-type')).toBe('image/svg+xml');
    expect(new TextDecoder().decode(upload.body)).toBe(SVG);
    const layerBody = JSON.parse(session.amplereadFetch.mock.calls[1]![1].body);
    expect(layerBody.payload.elements[0].asset).toBe(AST);
    expect((await store.getAsset(ref))?.remoteId).toBe(AST);
    expect((await store.getLayer(id))?.rev).toBe(1);
  });

  it('reuses an uploaded asset', async () => {
    const ref = await drawing();
    await saveMargin(store, { fileHash: 'hash-a', anchor, envelope: withArt(ref) });
    server(() => json(201, { id: AST, mime: 'image/svg+xml', width: 4, height: 4, bytes: 60 }));
    await flushOutbox(store);
    await saveMargin(store, { fileHash: 'hash-a', anchor, envelope: withArt(ref) });
    await flushOutbox(store);
    expect(paths().filter((p) => p === '/v1/layer-assets')).toHaveLength(1);
    expect(paths().filter((p) => p === '/v1/layers')).toHaveLength(2);
  });

  it('holds the layer op on upload backoff', async () => {
    const ref = await drawing();
    await saveMargin(store, { fileHash: 'hash-a', anchor, envelope: withArt(ref) });
    server(() => json(503, { error: 'temporarily_unavailable' }));
    const now = Date.now() + 10;
    expect(await flushOutbox(store, now)).toBe(0);
    expect(paths()).toEqual(['/v1/layer-assets']);
    expect(await store.dueOps(now, 'u1')).toEqual([]);
    const [op] = await store.dueOps(now + 60 * 60_000, 'u1');
    expect(op).toMatchObject({ method: 'POST', attempts: 1 });
  });

  it('waits for Retry-After on an upload 429', async () => {
    const ref = await drawing();
    await saveMargin(store, { fileHash: 'hash-a', anchor, envelope: withArt(ref) });
    server(() => json(429, { error: 'rate_limited' }, { 'retry-after': '120' }));
    const now = Date.now() + 10;
    await flushOutbox(store, now);
    expect(await store.dueOps(now + 119_000, 'u1')).toEqual([]);
    expect(await store.dueOps(now + 120_000, 'u1')).toHaveLength(1);
  });

  it('marks the layer error on upload 4xx', async () => {
    const ref = await drawing();
    const id = await saveMargin(store, { fileHash: 'hash-a', anchor, envelope: withArt(ref) });
    server(() => json(415, { error: 'unsupported_media_type' }));
    await flushOutbox(store);
    expect(paths()).toEqual(['/v1/layer-assets']);
    expect((await store.getLayer(id))?.error).toBe('unsupported_media_type');
    expect(await store.dueOps(Date.now() + 1000, 'u1')).toEqual([]);
  });

  it('sends two local copies of the same art that the server dedupes to one id', async () => {
    const a = await saveMargin(store, {
      fileHash: 'hash-a',
      anchor,
      envelope: withArt(await drawing()),
    });
    const b = await saveMargin(store, {
      fileHash: 'hash-a',
      anchor,
      envelope: withArt(await drawing()),
    });
    server(() => json(200, { id: AST }));
    expect(await flushOutbox(store)).toBe(2);
    expect((await store.getLayer(a))?.error).toBeNull();
    expect((await store.getLayer(b))?.error).toBeNull();
    expect(await store.dueOps(Date.now() + 10 ** 9, 'u1')).toEqual([]);
  });

  it("never uploads another account's asset", async () => {
    const ref = await drawing();
    const row = await store.getAsset(ref);
    await store.putAsset({ ...row!, userId: 'u2' });
    const id = await saveMargin(store, { fileHash: 'hash-a', anchor, envelope: withArt(ref) });
    server(() => json(201, { id: AST }));
    await flushOutbox(store);
    expect(session.amplereadFetch).not.toHaveBeenCalled();
    expect((await store.getLayer(id))?.error).toBe('unknown_asset');
  });

  it('assetUrl prefers local data, else fetches once and keeps it', async () => {
    const ref = await drawing();
    expect(await assetUrl(store, ref)).toMatch(/^blob:/);
    expect(session.amplereadFetch).not.toHaveBeenCalled();

    session.amplereadFetch.mockResolvedValueOnce(
      new Response(new Blob([SVG], { type: 'image/svg+xml' }), {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
      }),
    );
    const first = await assetUrl(store, AST);
    expect(first).toMatch(/^blob:/);
    expect(await assetUrl(store, AST)).toBe(first);
    expect(paths()).toEqual([`/v1/layer-assets/${AST}`]);
    expect((await store.assetByRemote(AST))?.mime).toBe('image/svg+xml');
  });

  it('assetUrl returns null when offline and not cached', async () => {
    session.amplereadFetch.mockRejectedValueOnce(new TypeError('offline'));
    expect(await assetUrl(store, `ast_${'b'.repeat(32)}`)).toBeNull();
    session.amplereadFetch.mockResolvedValueOnce(json(404, { error: 'not_found' }));
    expect(await assetUrl(store, `ast_${'c'.repeat(32)}`)).toBeNull();
    expect(await assetUrl(store, 'local:00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});
