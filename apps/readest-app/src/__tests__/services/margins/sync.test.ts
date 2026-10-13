import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeDatabaseService } from '@/services/database/nodeDatabaseService';
import { migrate } from '@/services/database/migrate';
import { getMigrations } from '@/services/database/migrations';
import { MarginsStore } from '@/services/margins/store';
import type { Anchor } from '@/services/margins/types';
import type { BookDoc } from '@/libs/document';
import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';

const session = vi.hoisted(() => ({
  getSession: vi.fn(),
  amplereadFetch: vi.fn(),
}));

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

const core = vi.hoisted(() => ({
  loadBook: vi.fn(async () => {}),
  fingerprint: vi.fn(async () => [['1', '2'], null]),
}));

vi.mock('@/services/margins/marginsClient', () => ({ getMarginsCore: () => core }));
vi.mock('@/services/margins/textMap', () => ({
  buildTextMap: vi.fn(async () => [{ runs: ['a'], breaks: [], skip: false }]),
}));

let currentStore: MarginsStore;
vi.mock('@/services/margins/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/margins/store')>()),
  openMarginsStore: async () => currentStore,
}));

import { AmpleReadSignedOutError } from '@/services/ampleread/auth/session';
import { flushOutbox, pullChanges, queueLayerWrite } from '@/services/margins/sync';
import { inMarginsFamily, marginsBookReady, onMarginsBookOpen } from '@/services/margins/bookOpen';

const anchor = (textId: string | null = null): Anchor => ({
  textId,
  kind: 'span',
  quote: { exact: 'tired of sitting' },
  context: { prefixHash: 'p', suffixHash: 's', prefix: null, suffix: null },
  hint: { position: 0.1, file: { fileHash: 'hash-a', cfi: 'epubcfi(/6/2!/4/2,/1:0,/1:5)' } },
  v: 1,
});

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

const view = (id: string, rev: number, textId = 'txt_a', deletedAt: string | null = null) => ({
  id,
  textId,
  anchor: anchor(textId),
  kind: 'note',
  contract: 'v1',
  payload: { text: id },
  visibility: 'private',
  rev,
  createdAt: '2026-10-12T00:00:00Z',
  updatedAt: '2026-10-12T00:00:00Z',
  deletedAt,
});

const book = { hash: 'hash-a', title: 'Alice', author: 'Lewis Carroll' } as Book;
const bookDoc = { metadata: { language: 'en' }, sections: [] } as unknown as BookDoc;
const appService = {} as AppService;

const putLocalLayer = async (id: string, textId: string | null = null) =>
  currentStore.putLayer({
    id,
    fileHash: 'hash-a',
    textId,
    anchor: anchor(textId),
    kind: 'note',
    payload: {},
    rev: null,
    deleted: false,
    userId: (await session.getSession())?.me.id ?? null,
  });

const queuePost = async (id: string, textId: string | null = null) => {
  await putLocalLayer(id, textId);
  await queueLayerWrite(currentStore, {
    layerId: id,
    method: 'POST',
    body: { id, anchor: anchor(textId), kind: 'note', payload: {} },
  });
};

const sentBody = (call: number) =>
  JSON.parse(session.amplereadFetch.mock.calls[call]![1].body as string);

const signInAs = (id: string | null) =>
  session.getSession.mockResolvedValue(id ? { tokens: {}, me: { id } } : null);

const freshStore = async () => {
  const db = await NodeDatabaseService.open(':memory:');
  await migrate(db, getMigrations('margins'));
  currentStore = MarginsStore.from(db);
  signInAs('usr_a');
  session.amplereadFetch.mockReset();
  install.installFetch.mockReset();
};

describe('margins sync', () => {
  beforeEach(async () => {
    await freshStore();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => vi.restoreAllMocks());

  it('sends nothing and keeps the ops when signed out', async () => {
    await queuePost('lyr_1', 'txt_a');
    session.amplereadFetch.mockRejectedValue(new AmpleReadSignedOutError());
    expect(await flushOutbox(currentStore)).toBe(0);
    expect(await currentStore.dueOps(Date.now(), 'usr_a')).toHaveLength(1);
  });

  it('sends ops in order and acks them', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000);
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('0000-b-0-0-0')
      .mockReturnValueOnce('0000-a-0-0-0');
    await queuePost('lyr_1', 'txt_a');
    await queuePost('lyr_2', 'txt_a');
    session.amplereadFetch
      .mockResolvedValueOnce(json(200, view('lyr_1', 1)))
      .mockResolvedValueOnce(json(200, view('lyr_2', 2)));
    expect(await flushOutbox(currentStore, Number.MAX_SAFE_INTEGER)).toBe(2);
    expect([sentBody(0).id, sentBody(1).id]).toEqual(['lyr_1', 'lyr_2']);
    expect(session.amplereadFetch.mock.calls[0]![0]).toBe('/v1/layers');
    expect(await currentStore.dueOps(Number.MAX_SAFE_INTEGER, 'usr_a')).toEqual([]);
    expect((await currentStore.layersForFile('hash-a', 'usr_a')).map((l) => l.rev).sort()).toEqual([
      1, 2,
    ]);
  });

  it('sends a delete to the layer path without a body', async () => {
    await queueLayerWrite(currentStore, { layerId: 'lyr_9', method: 'DELETE', body: null });
    session.amplereadFetch.mockResolvedValue(json(200, view('lyr_9', 3, 'txt_a', 'now')));
    await flushOutbox(currentStore);
    const [path, init] = session.amplereadFetch.mock.calls[0]!;
    expect([path, init.method, init.body]).toEqual(['/v1/layers/lyr_9', 'DELETE', undefined]);
  });

  it('holds later ops on a layer while its earlier op waits to retry', async () => {
    await queuePost('lyr_1', 'txt_a');
    await queueLayerWrite(currentStore, {
      layerId: 'lyr_1',
      method: 'PATCH',
      body: { payload: { text: 'edit' } },
    });
    session.amplereadFetch.mockResolvedValue(json(503, { error: 'unavailable' }));
    const now = Date.now() + 1;
    await flushOutbox(currentStore, now);
    await flushOutbox(currentStore, now + 500);
    expect(session.amplereadFetch).toHaveBeenCalledTimes(1);
    expect(await currentStore.dueOps(Number.MAX_SAFE_INTEGER, 'usr_a')).toHaveLength(2);
  });

  it('reschedules a 503 with one more attempt', async () => {
    await queuePost('lyr_1', 'txt_a');
    session.amplereadFetch.mockResolvedValue(json(503, { error: 'unavailable' }));
    const now = Date.now() + 1;
    await flushOutbox(currentStore, now);
    const [op] = await currentStore.dueOps(Number.MAX_SAFE_INTEGER, 'usr_a');
    expect(op!.attempts).toBe(1);
    expect(op!.nextAt).toBe(now + 1_000);
  });

  it('acks a 422 and marks the layer', async () => {
    await queuePost('lyr_1', 'txt_a');
    session.amplereadFetch.mockResolvedValue(json(422, { error: 'excerpt_too_long' }));
    await flushOutbox(currentStore);
    expect(await currentStore.dueOps(Number.MAX_SAFE_INTEGER, 'usr_a')).toEqual([]);
    expect((await currentStore.layersForFile('hash-a', 'usr_a'))[0]!.error).toBe(
      'excerpt_too_long',
    );
  });

  it('honours Retry-After on a 429', async () => {
    await queuePost('lyr_1', 'txt_a');
    session.amplereadFetch.mockResolvedValue(
      json(429, { error: 'rate_limited' }, { 'retry-after': '30' }),
    );
    const now = Date.now() + 1;
    await flushOutbox(currentStore, now);
    expect((await currentStore.dueOps(Number.MAX_SAFE_INTEGER, 'usr_a'))[0]!.nextAt).toBe(
      now + 30_000,
    );
  });

  it('fills a missing anchor textId from the link', async () => {
    await currentStore.setTextLink('hash-a', 'txt_linked', 'en', 'txt_linked');
    await queuePost('lyr_1');
    session.amplereadFetch.mockResolvedValue(json(200, view('lyr_1', 1, 'txt_linked')));
    await flushOutbox(currentStore);
    expect(sentBody(0).anchor.textId).toBe('txt_linked');
  });

  it('keeps an op whose book has no link yet', async () => {
    await queuePost('lyr_1');
    await flushOutbox(currentStore);
    expect(session.amplereadFetch).not.toHaveBeenCalled();
    expect(await currentStore.dueOps(Date.now(), 'usr_a')).toHaveLength(1);
  });

  it('rewrites the link when a create ack carries another textId', async () => {
    await currentStore.setTextLink('hash-a', 'txt_old', 'en', 'txt_old');
    await queuePost('lyr_1');
    session.amplereadFetch.mockResolvedValue(json(200, view('lyr_1', 1, 'txt_merged')));
    await flushOutbox(currentStore);
    expect((await currentStore.getTextLink('hash-a'))!.textId).toBe('txt_merged');
  });

  it('pulls until nextCursor is null and saves the cursor', async () => {
    await currentStore.setTextLink('hash-a', 'txt_a', 'en', 'txt_a');
    session.amplereadFetch
      .mockResolvedValueOnce(
        json(200, { layers: [view('lyr_1', 1), view('lyr_2', 3)], nextCursor: 3 }),
      )
      .mockResolvedValueOnce(json(200, { layers: [view('lyr_3', 4)], nextCursor: null }));
    expect(await pullChanges(currentStore)).toBe(3);
    expect(session.amplereadFetch.mock.calls.map((c) => c[0])).toEqual([
      '/v1/layers/changes?since=0',
      '/v1/layers/changes?since=3',
      '/v1/texts/txt_a',
    ]);
    expect(await currentStore.getCursor('usr_a')).toBe(4);
    expect((await currentStore.layersForFile('hash-a', 'usr_a')).map((l) => l.id).sort()).toEqual([
      'lyr_1',
      'lyr_2',
      'lyr_3',
    ]);
  });

  it('applies a pulled delete and keeps a newer local rev', async () => {
    await currentStore.setTextLink('hash-a', 'txt_a', 'en', 'txt_a');
    await putLocalLayer('lyr_1', 'txt_a');
    await currentStore.putLayer({
      ...view('lyr_new', 9),
      fileHash: 'hash-a',
      deleted: false,
      createdAt: 9,
      updatedAt: 9,
    });
    session.amplereadFetch.mockResolvedValueOnce(
      json(200, {
        layers: [view('lyr_1', 1, 'txt_a', '2026-10-12T01:00:00Z'), view('lyr_new', 5)],
        nextCursor: null,
      }),
    );
    await pullChanges(currentStore);
    const rows = await currentStore.layersForFile('hash-a', 'usr_a');
    expect(rows.find((l) => l.id === 'lyr_1')!.deleted).toBe(true);
    expect(rows.find((l) => l.id === 'lyr_new')!.rev).toBe(9);
  });

  it('queues a write while signed out under local-first', async () => {
    signInAs(null);
    await queueLayerWrite(currentStore, { layerId: 'lyr_1', method: 'DELETE', body: null });
    expect(await currentStore.dueOps(Date.now(), null)).toHaveLength(1);
  });
});

describe('margins per account', () => {
  beforeEach(async () => {
    await freshStore();
    await currentStore.setTextLink('hash-a', 'txt_a', 'en', 'txt_a');
  });

  const feed = (...layers: ReturnType<typeof view>[]) => json(200, { layers, nextCursor: null });
  const ids = async (userId: string | null) =>
    (await currentStore.layersForFile('hash-a', userId)).map((l) => l.id).sort();

  it('keeps each account to its own layers and restores them on sign-in', async () => {
    session.amplereadFetch.mockResolvedValueOnce(feed(view('lyr_a', 1)));
    await pullChanges(currentStore);
    signInAs('usr_b');
    session.amplereadFetch.mockResolvedValueOnce(feed(view('lyr_b', 1)));
    await pullChanges(currentStore);
    expect(await ids('usr_b')).toEqual(['lyr_b']);
    expect(await ids(null)).toEqual([]);
    expect(await ids('usr_a')).toEqual(['lyr_a']);
  });

  it('keeps a change cursor per account', async () => {
    session.amplereadFetch.mockResolvedValueOnce(feed(view('lyr_a', 4)));
    await pullChanges(currentStore);
    signInAs('usr_b');
    session.amplereadFetch.mockResolvedValueOnce(feed(view('lyr_b', 2)));
    await pullChanges(currentStore);
    signInAs('usr_a');
    session.amplereadFetch.mockResolvedValueOnce(feed());
    await pullChanges(currentStore);
    const feedCalls = session.amplereadFetch.mock.calls
      .map((c) => c[0] as string)
      .filter((path) => path.startsWith('/v1/layers'));
    expect(feedCalls).toEqual([
      '/v1/layers/changes?since=0',
      '/v1/layers/changes?since=0',
      '/v1/layers/changes?since=4',
    ]);
    expect(await currentStore.getCursor('usr_b')).toBe(2);
  });

  it('gives ops queued while signed out to the next account that signs in', async () => {
    signInAs(null);
    await queuePost('lyr_1', 'txt_a');
    signInAs('usr_b');
    session.amplereadFetch.mockResolvedValueOnce(json(200, view('lyr_1', 1)));
    expect(await flushOutbox(currentStore)).toBe(1);
    expect(await ids('usr_b')).toEqual(['lyr_1']);
    expect(await ids('usr_a')).toEqual([]);
  });

  it("never sends another account's queued ops", async () => {
    await queuePost('lyr_1', 'txt_a');
    signInAs('usr_b');
    expect(await flushOutbox(currentStore)).toBe(0);
    expect(session.amplereadFetch).not.toHaveBeenCalled();
    expect(await ids('usr_b')).toEqual([]);
    expect(await currentStore.dueOps(Date.now(), 'usr_a')).toHaveLength(1);
  });

  it('stops flushing when the account changes mid-flush', async () => {
    await queuePost('lyr_1', 'txt_a');
    await queuePost('lyr_2', 'txt_a');
    session.amplereadFetch.mockImplementationOnce(async () => {
      signInAs('usr_b');
      return json(200, view('lyr_1', 1));
    });
    await flushOutbox(currentStore, Number.MAX_SAFE_INTEGER);
    expect(session.amplereadFetch).toHaveBeenCalledTimes(1);
    expect(await currentStore.dueOps(Number.MAX_SAFE_INTEGER, 'usr_a')).toHaveLength(1);
  });

  it('drops a pulled page when the account changed during the request', async () => {
    session.amplereadFetch.mockImplementationOnce(async () => {
      signInAs('usr_b');
      return feed(view('lyr_a', 1));
    });
    await pullChanges(currentStore);
    expect(await ids('usr_b')).toEqual([]);
    expect(await currentStore.getCursor('usr_a')).toBe(0);
  });
});

describe('margins book open', () => {
  beforeEach(freshStore);

  const feedEmpty = () => json(200, { layers: [], nextCursor: null });

  it('registers on no match and resolves ready after loadBook', async () => {
    session.amplereadFetch
      .mockResolvedValueOnce(json(200, { matches: [] }))
      .mockResolvedValueOnce(json(200, { textId: 'txt_new' }))
      .mockImplementation(async () => feedEmpty());
    await onMarginsBookOpen(appService, book, bookDoc);
    await marginsBookReady('hash-a');
    expect(core.loadBook).toHaveBeenCalledWith('hash-a', expect.any(Array));
    const [matchPath, matchInit] = session.amplereadFetch.mock.calls[0]!;
    expect(matchPath).toBe('/v1/texts/match');
    expect(JSON.parse(matchInit.body)).toEqual({ sections: [['1', '2'], null], language: 'en' });
    const [path, init] = session.amplereadFetch.mock.calls[1]!;
    expect(path).toBe('/v1/texts');
    expect(JSON.parse(init.body)).toEqual({
      sections: [['1', '2'], null],
      language: 'en',
      meta: { title: 'Alice', author: 'Lewis Carroll' },
      versionOf: null,
    });
    expect(await currentStore.getTextLink('hash-a')).toMatchObject({
      textId: 'txt_new',
      familyId: 'txt_new',
    });
    expect(await currentStore.getText('txt_new')).toMatchObject({
      capped: true,
      familyId: 'txt_new',
      title: 'Alice',
    });
  });

  it('links a same match without registering', async () => {
    session.amplereadFetch
      .mockResolvedValueOnce(
        json(200, {
          matches: [
            {
              textId: 'txt_same',
              confidence: 0.9,
              relation: 'same',
              familyId: 'txt_root',
              capped: false,
            },
          ],
        }),
      )
      .mockImplementation(async () => feedEmpty());
    await onMarginsBookOpen(appService, { ...book, hash: 'hash-b' }, bookDoc);
    expect(session.amplereadFetch.mock.calls.map((c) => c[0])).not.toContain('/v1/texts');
    expect(await currentStore.getTextLink('hash-b')).toMatchObject({
      textId: 'txt_same',
      familyId: 'txt_root',
    });
    expect(await currentStore.getText('txt_same')).toMatchObject({
      capped: false,
      familyId: 'txt_root',
    });
  });

  it('registers a version with versionOf and stores its family', async () => {
    session.amplereadFetch
      .mockResolvedValueOnce(
        json(200, {
          matches: [
            { textId: 'txt_old', confidence: 0.8, relation: 'version', familyId: 'txt_root' },
          ],
        }),
      )
      .mockResolvedValueOnce(json(200, { textId: 'txt_v2' }))
      .mockImplementation(async () => feedEmpty());
    await onMarginsBookOpen(appService, { ...book, hash: 'hash-c' }, bookDoc);
    expect(JSON.parse(session.amplereadFetch.mock.calls[1]![1].body).versionOf).toBe('txt_old');
    expect(await currentStore.getTextLink('hash-c')).toMatchObject({
      textId: 'txt_v2',
      familyId: 'txt_root',
    });
    expect(inMarginsFamily('hash-c')('txt_old')).toBe(true);
    expect(inMarginsFamily('hash-c')('txt_v2')).toBe(false);
    expect(inMarginsFamily('hash-c')('txt_other')).toBe(false);
  });

  it('leaves no link on a 503 match and retries on the next open', async () => {
    const hashed = { ...book, hash: 'hash-d' };
    session.amplereadFetch.mockResolvedValueOnce(json(503, { error: 'unavailable' }));
    await onMarginsBookOpen(appService, hashed, bookDoc);
    expect(await currentStore.getTextLink('hash-d')).toBeNull();
    session.amplereadFetch
      .mockResolvedValueOnce(
        json(200, {
          matches: [{ textId: 'txt_d', confidence: 0.95, relation: 'same', familyId: 'txt_d' }],
        }),
      )
      .mockImplementation(async () => feedEmpty());
    await onMarginsBookOpen(appService, hashed, bookDoc);
    expect((await currentStore.getTextLink('hash-d'))!.textId).toBe('txt_d');
  });

  it('matches with the install token when signed out and links a same match', async () => {
    signInAs(null);
    install.installFetch.mockResolvedValueOnce(
      json(200, {
        matches: [{ textId: 'txt_same', confidence: 0.9, relation: 'same', familyId: 'txt_root' }],
      }),
    );
    await onMarginsBookOpen(appService, { ...book, hash: 'hash-e' }, bookDoc);
    expect(core.fingerprint).toHaveBeenCalledWith('hash-e');
    expect(install.installFetch).toHaveBeenCalledTimes(1);
    expect(install.installFetch.mock.calls[0]![0]).toBe('/v1/texts/match');
    expect(session.amplereadFetch).not.toHaveBeenCalled();
    expect(await currentStore.getTextLink('hash-e')).toMatchObject({
      textId: 'txt_same',
      familyId: 'txt_root',
    });
  });

  it('keeps a signed-out version match as a pending family and registers after sign-in', async () => {
    signInAs(null);
    const hashed = { ...book, hash: 'hash-f' };
    install.installFetch.mockResolvedValueOnce(
      json(200, {
        matches: [
          { textId: 'txt_f1', confidence: 0.8, relation: 'version', familyId: 'txt_froot' },
        ],
      }),
    );
    await onMarginsBookOpen(appService, hashed, bookDoc);
    expect(await currentStore.getTextLink('hash-f')).toBeNull();
    expect(inMarginsFamily('hash-f')('txt_f1')).toBe(true);
    expect(inMarginsFamily('hash-f')('txt_other')).toBe(false);

    signInAs('usr_a');
    session.amplereadFetch
      .mockResolvedValueOnce(
        json(200, {
          matches: [
            { textId: 'txt_f1', confidence: 0.8, relation: 'version', familyId: 'txt_froot' },
          ],
        }),
      )
      .mockResolvedValueOnce(json(200, { textId: 'txt_f2' }))
      .mockImplementation(async () => feedEmpty());
    await onMarginsBookOpen(appService, hashed, bookDoc);
    expect(JSON.parse(session.amplereadFetch.mock.calls[1]![1].body).versionOf).toBe('txt_f1');
    expect(await currentStore.getTextLink('hash-f')).toMatchObject({
      textId: 'txt_f2',
      familyId: 'txt_froot',
    });
    expect(install.installFetch).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a signed-out empty match until sign-in, then registers', async () => {
    signInAs(null);
    const hashed = { ...book, hash: 'hash-g' };
    install.installFetch.mockResolvedValue(json(200, { matches: [] }));
    await onMarginsBookOpen(appService, hashed, bookDoc);
    await onMarginsBookOpen(appService, hashed, bookDoc);
    expect(install.installFetch).toHaveBeenCalledTimes(1);
    expect(session.amplereadFetch).not.toHaveBeenCalled();
    expect(await currentStore.getTextLink('hash-g')).toBeNull();

    signInAs('usr_a');
    session.amplereadFetch
      .mockResolvedValueOnce(json(200, { matches: [] }))
      .mockResolvedValueOnce(json(200, { textId: 'txt_g' }))
      .mockImplementation(async () => feedEmpty());
    await onMarginsBookOpen(appService, hashed, bookDoc);
    expect(session.amplereadFetch.mock.calls[1]![0]).toBe('/v1/texts');
    expect((await currentStore.getTextLink('hash-g'))!.textId).toBe('txt_g');
  });

  it('retries a failed signed-out match on the next open', async () => {
    signInAs(null);
    const hashed = { ...book, hash: 'hash-h' };
    install.installFetch
      .mockResolvedValueOnce(json(503, { error: 'unavailable' }))
      .mockResolvedValueOnce(
        json(200, {
          matches: [{ textId: 'txt_h', confidence: 0.95, relation: 'same', familyId: 'txt_h' }],
        }),
      );
    await onMarginsBookOpen(appService, hashed, bookDoc);
    await onMarginsBookOpen(appService, hashed, bookDoc);
    expect((await currentStore.getTextLink('hash-h'))!.textId).toBe('txt_h');
  });
});
