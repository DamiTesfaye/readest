import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

import {
  editMargin,
  hiddenMargins,
  newLayerId,
  onMarginsChanged,
  retryMargin,
  saveMargin,
  scheduleDelete,
} from '@/services/margins/margins';
import { emptyEnvelope, type Envelope } from '@/services/margins/payload';
import { flushOutbox, saveLink } from '@/services/margins/sync';

const anchor = (textId: string | null = null): Anchor => ({
  textId,
  kind: 'span',
  quote: { exact: 'tired of sitting' },
  context: { prefixHash: 'p', suffixHash: 's', prefix: null, suffix: null },
  hint: { position: 0.1, file: { fileHash: 'hash-a', cfi: 'epubcfi(/6/2!/4/2,/1:0,/1:5)' } },
  v: 1,
});

const withNote = (text: string): Envelope => ({
  ...emptyEnvelope(),
  elements: [{ id: 'n1', kind: 'note', frame: { x: 0.5, y: 0.5, w: 0.5, r: 0 }, text }],
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const echo = (rev: number) =>
  session.amplereadFetch.mockImplementation(async (_path: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    return json(200, {
      ...body,
      textId: body.anchor.textId,
      rev,
      createdAt: '2026-10-13T00:00:00Z',
      deletedAt: null,
    });
  });

const calls = () =>
  session.amplereadFetch.mock.calls.map(([path, init]) => ({
    path,
    method: init.method,
    body: init.body ? JSON.parse(init.body) : undefined,
  }));

describe('margins service', () => {
  let store: MarginsStore;
  beforeEach(async () => {
    const db = await NodeDatabaseService.open(':memory:');
    await migrate(db, getMigrations('margins'));
    store = MarginsStore.from(db);
    session.getSession.mockResolvedValue({ tokens: {}, me: { id: 'usr_a' } });
    session.amplereadFetch.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('makes layer ids the server accepts', () => {
    expect(newLayerId()).toMatch(/^lyr_[0-9a-f]{32}$/);
  });

  it('holds a POST until the book links, then sends it with the text id', async () => {
    const changed = vi.fn();
    const off = onMarginsChanged(changed);
    const id = await saveMargin(store, {
      fileHash: 'hash-a',
      anchor: anchor(),
      envelope: withNote('hi'),
    });
    off();
    expect(changed).toHaveBeenCalled();
    expect(await store.getLayer(id)).toMatchObject({ kind: 'note', rev: null, userId: 'usr_a' });
    expect(await flushOutbox(store)).toBe(0);
    expect(session.amplereadFetch).not.toHaveBeenCalled();
    await saveLink(store, 'hash-a', 'txt_a', 'en', 'txt_a');
    echo(1);
    expect(await flushOutbox(store)).toBe(1);
    expect(calls()).toMatchObject([
      {
        path: '/v1/layers',
        method: 'POST',
        body: { id, kind: 'note', anchor: { textId: 'txt_a' } },
      },
    ]);
    expect((await store.getLayer(id))?.rev).toBe(1);
  });

  it('editing an unsent Margin rewrites its queued POST', async () => {
    const id = await saveMargin(store, {
      fileHash: 'hash-a',
      anchor: anchor('txt_a'),
      envelope: emptyEnvelope(),
    });
    await editMargin(store, id, { envelope: withNote('second') });
    const ops = await store.dueOps(Date.now() + 1000, 'usr_a');
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      method: 'POST',
      body: { kind: 'note', payload: withNote('second') },
    });
    expect(await store.getLayer(id)).toMatchObject({ kind: 'note', payload: withNote('second') });
  });

  const echoDuring = (during: () => Promise<void>) => {
    session.amplereadFetch.mockImplementationOnce(async (_path: string, init: RequestInit) => {
      await during();
      const body = JSON.parse(init.body as string);
      return json(200, {
        ...body,
        textId: 'txt_a',
        rev: 4,
        createdAt: '2026-10-13T00:00:00Z',
        deletedAt: null,
      });
    });
  };

  it('an edit during an in-flight POST is sent as a PATCH, not lost to the echo', async () => {
    const id = await saveMargin(store, {
      fileHash: 'hash-a',
      anchor: anchor('txt_a'),
      envelope: withNote('first'),
    });
    echoDuring(() => editMargin(store, id, { envelope: withNote('second') }));
    await flushOutbox(store);
    expect(await store.getLayer(id)).toMatchObject({ rev: 4, payload: withNote('second') });
    echo(5);
    await flushOutbox(store, Date.now() + 1000);
    expect(calls()[1]).toMatchObject({
      path: `/v1/layers/${id}`,
      method: 'PATCH',
      body: { payload: withNote('second') },
    });
  });

  it('a delete during an in-flight POST is sent as a DELETE, not revived by the echo', async () => {
    const id = await saveMargin(store, {
      fileHash: 'hash-a',
      anchor: anchor('txt_a'),
      envelope: withNote('first'),
    });
    echoDuring(() => scheduleDelete(store, id, 0).flush());
    await flushOutbox(store);
    expect((await store.getLayer(id))?.deleted).toBe(true);
    session.amplereadFetch.mockResolvedValueOnce(
      json(200, {
        ...{
          id,
          textId: 'txt_a',
          anchor: anchor('txt_a'),
          kind: 'note',
          payload: withNote('first'),
        },
        rev: 5,
        createdAt: '2026-10-13T00:00:00Z',
        deletedAt: '2026-10-13T00:00:01Z',
      }),
    );
    await flushOutbox(store, Date.now() + 1000);
    expect(calls()[1]).toMatchObject({ path: `/v1/layers/${id}`, method: 'DELETE' });
    expect((await store.getLayer(id))?.deleted).toBe(true);
  });

  it('retrying a refused, never-stored Margin queues a POST', async () => {
    const id = await saveMargin(store, {
      fileHash: 'hash-a',
      anchor: anchor('txt_a'),
      envelope: withNote('x'),
    });
    session.amplereadFetch.mockResolvedValueOnce(json(422, { error: 'excerpt_quota_exceeded' }));
    await flushOutbox(store);
    expect((await store.getLayer(id))?.error).toBe('excerpt_quota_exceeded');
    expect(await store.dueOps(Date.now() + 1000, 'usr_a')).toEqual([]);
    await retryMargin(store, id);
    const ops = await store.dueOps(Date.now() + 1000, 'usr_a');
    expect(ops.map((o) => o.method)).toEqual(['POST']);
    expect(ops[0]!.body).toMatchObject({ id, kind: 'note', payload: withNote('x') });
    expect((await store.getLayer(id))?.error).toBeNull();
  });

  it('editing a refused, never-stored Margin queues a POST with the edit', async () => {
    const id = await saveMargin(store, {
      fileHash: 'hash-a',
      anchor: anchor('txt_a'),
      envelope: withNote('x'),
    });
    session.amplereadFetch.mockResolvedValueOnce(json(422, { error: 'invalid_payload' }));
    await flushOutbox(store);
    await editMargin(store, id, { envelope: withNote('fixed') });
    const ops = await store.dueOps(Date.now() + 1000, 'usr_a');
    expect(ops.map((o) => [o.method, (o.body as { payload: Envelope }).payload])).toEqual([
      ['POST', withNote('fixed')],
    ]);
  });

  it('a play Margin carries its contract, and loses it with its play element', async () => {
    const play = {
      ...emptyEnvelope(),
      elements: [
        {
          id: 'p1',
          kind: 'play',
          frame: { x: 0.5, y: 0.6, w: 0.8, r: 0 },
          contract: 'detach',
          alt: 'loose words',
          detach: { unit: 'word', spans: [[0, 5]], sink: 'floor', seed: 1 },
        },
      ],
    } as Envelope;
    const id = await saveMargin(store, {
      fileHash: 'hash-a',
      anchor: anchor('txt_a'),
      envelope: play,
    });
    expect(await store.getLayer(id)).toMatchObject({ kind: 'play', contract: 'detach' });
    expect((await store.dueOps(Date.now() + 1000, 'usr_a'))[0]!.body).toMatchObject({
      kind: 'play',
      contract: 'detach',
    });
    echo(3);
    await flushOutbox(store);
    await editMargin(store, id, { envelope: withNote('later') });
    expect((await store.dueOps(Date.now() + 1000, 'usr_a'))[0]!.body).toMatchObject({
      kind: 'note',
      contract: 'overlay',
    });
    expect(await store.getLayer(id)).toMatchObject({ contract: 'overlay' });
  });

  it('removing the play element during an in-flight POST sends the overlay contract', async () => {
    const play = {
      ...emptyEnvelope(),
      elements: [
        {
          id: 'p1',
          kind: 'play',
          frame: { x: 0.5, y: 0.6, w: 0.8, r: 0 },
          contract: 'detach',
          alt: 'loose words',
          detach: { unit: 'word', spans: [[0, 5]], sink: 'floor', seed: 1 },
        },
      ],
    } as Envelope;
    const id = await saveMargin(store, {
      fileHash: 'hash-a',
      anchor: anchor('txt_a'),
      envelope: play,
    });
    echoDuring(() => editMargin(store, id, { envelope: withNote('later') }));
    await flushOutbox(store);
    const ops = await store.dueOps(Date.now() + 1000, 'usr_a');
    expect(ops.map((o) => o.method)).toEqual(['PATCH']);
    expect(ops[0]!.body).toMatchObject({ kind: 'note', contract: 'overlay' });
  });

  it('editing a synced Margin queues a PATCH', async () => {
    const id = await saveMargin(store, {
      fileHash: 'hash-a',
      anchor: anchor('txt_a'),
      envelope: emptyEnvelope(),
    });
    echo(3);
    await flushOutbox(store);
    await editMargin(store, id, { envelope: withNote('later') });
    const ops = await store.dueOps(Date.now() + 1000, 'usr_a');
    expect(ops).toMatchObject([
      { method: 'PATCH', body: { kind: 'note', payload: withNote('later') } },
    ]);
    expect(ops[0]!.body).not.toHaveProperty('anchor');
    expect(await store.getLayer(id)).toMatchObject({ rev: 3, kind: 'note' });
  });

  it('undoing a delete queues nothing', async () => {
    vi.useFakeTimers();
    const id = await saveMargin(store, {
      fileHash: 'hash-a',
      anchor: anchor('txt_a'),
      envelope: emptyEnvelope(),
    });
    const pending = scheduleDelete(store, id);
    expect(hiddenMargins().has(id)).toBe(true);
    pending.undo();
    expect(hiddenMargins().has(id)).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect((await store.getLayer(id))?.deleted).toBe(false);
    expect(await store.dueOps(Date.now() + 1000, 'usr_a')).toHaveLength(1);
  });

  it('a delete after the window queues DELETE for a stored row and nothing for an unsent one', async () => {
    vi.useFakeTimers();
    const stored = await saveMargin(store, {
      fileHash: 'hash-a',
      anchor: anchor('txt_a'),
      envelope: emptyEnvelope(),
    });
    echo(5);
    await flushOutbox(store);
    const unsent = await saveMargin(store, {
      fileHash: 'hash-a',
      anchor: anchor('txt_a'),
      envelope: emptyEnvelope(),
    });
    scheduleDelete(store, unsent);
    scheduleDelete(store, stored);
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await store.getLayer(unsent))?.deleted).toBe(true);
    expect((await store.getLayer(stored))?.deleted).toBe(true);
    const ops = await store.dueOps(Date.now() + 1000, 'usr_a');
    expect(ops.map((o) => [o.layerId, o.method])).toEqual([[stored, 'DELETE']]);
    expect(hiddenMargins().size).toBe(0);
  });

  it('flushes a pending delete at once', async () => {
    const id = await saveMargin(store, {
      fileHash: 'hash-a',
      anchor: anchor('txt_a'),
      envelope: emptyEnvelope(),
    });
    await scheduleDelete(store, id, 60_000).flush();
    expect((await store.getLayer(id))?.deleted).toBe(true);
    expect(await store.dueOps(Date.now() + 1000, 'usr_a')).toEqual([]);
  });
});
