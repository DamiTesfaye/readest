import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { FakeReplicaCloud } from '@/__tests__/helpers/fakeReplicaCloud';
import { HlcGenerator, hlcPack } from '@/libs/crdt';
import type { Hlc, ReplicaRow } from '@/types/replica';

const holder = vi.hoisted(() => ({ cloud: null as FakeReplicaCloud | null }));

vi.mock('@/utils/supabase', () => ({
  createSupabaseClient: () => holder.cloud!.client(),
  createSupabaseAdminClient: () => holder.cloud!.client(),
}));

vi.mock('@/utils/access', () => ({
  validateUserAndToken: async () => ({ user: { id: 'u1' }, token: 'token' }),
  getAccessToken: async () => 'token',
}));

vi.mock('@/utils/object', () => ({
  deleteObject: async (fileKey: string) => holder.cloud!.deleteObject(fileKey),
}));

vi.mock('@/services/environment', () => ({
  getAPIBaseUrl: () => 'http://localhost/api',
}));

import { POST } from '@/pages/api/sync/replicas';
import { ReplicaSyncClient } from '@/libs/replicaSyncClient';
import { ReplicaSyncManager } from '@/services/sync/replicaSyncManager';

const USER = 'u1';
const DEV = 'dev-a';

let counter = 0;
const clock = (): Hlc => hlcPack(Date.now(), counter++, DEV) as Hlc;

const liveRow = (kind: string, replicaId: string): ReplicaRow => {
  const t = clock();
  return {
    user_id: USER,
    kind,
    replica_id: replicaId,
    fields_jsonb:
      kind === 'mindmap'
        ? { bookHash: { v: 'book1', t, s: DEV } }
        : { name: { v: 'x', t, s: DEV } },
    manifest_jsonb: null,
    deleted_at_ts: null,
    reincarnation: null,
    updated_at_ts: t,
    schema_version: 1,
  };
};

const postRows = (body: string): Promise<Response> =>
  POST(
    new NextRequest('http://localhost/api/sync/replicas', {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      body,
    }),
  );

const push = (...rows: ReplicaRow[]): Promise<Response> => postRows(JSON.stringify({ rows }));

const routeFetch = async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
  postRows(String(init?.body));

const merged = (kind: string, replicaId: string): boolean =>
  holder.cloud!.row(USER, kind, replicaId) !== undefined;

beforeEach(() => {
  holder.cloud = new FakeReplicaCloud();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('fetch', routeFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/sync/replicas when the database CHECK rejects a kind', () => {
  test('answers 422 UNKNOWN_KIND with the index of the rejected row', async () => {
    holder.cloud!.kindsRejectedByCheck.add('mindmap');
    const response = await push(liveRow('font', 'font1'), liveRow('mindmap', 'map1'));
    expect(response.status).toBe(422);
    const body = (await response.json()) as { code?: string; offendingIndex?: number };
    expect(body.code).toBe('UNKNOWN_KIND');
    expect(body.offendingIndex).toBe(1);
  });

  test('other database errors still answer 500 SERVER', async () => {
    const cloud = holder.cloud!;
    const base = cloud.client();
    vi.spyOn(cloud, 'client').mockReturnValue({
      ...base,
      rpc: () => ({
        single: async () => ({ data: null, error: { code: '23514', message: 'other_check' } }),
      }),
    });
    const response = await push(liveRow('font', 'font1'));
    expect(response.status).toBe(500);
    expect(((await response.json()) as { code?: string }).code).toBe('SERVER');
  });

  test('the client drops the rejected kind and the other kinds of the batch are merged', async () => {
    holder.cloud!.kindsRejectedByCheck.add('mindmap');
    const cursors = new Map<string, Hlc>();
    const manager = new ReplicaSyncManager({
      hlc: new HlcGenerator(DEV, () => Date.now()),
      client: new ReplicaSyncClient(),
      cursorStore: {
        get: (kind) => cursors.get(kind) ?? null,
        set: (kind, hlc) => {
          cursors.set(kind, hlc);
        },
      },
    });
    manager.markDirty(liveRow('mindmap', 'map1'));
    manager.markDirty(liveRow('font', 'font1'));
    manager.markDirty(liveRow('dictionary', 'dict1'));

    await manager.flush();

    expect(merged('font', 'font1')).toBe(true);
    expect(merged('dictionary', 'dict1')).toBe(true);
    expect(merged('mindmap', 'map1')).toBe(false);
    expect(manager.isKindSupported('mindmap')).toBe(false);
    expect(manager.pendingKeys()).toEqual([{ kind: 'mindmap', replicaId: 'map1' }]);
  });
});
