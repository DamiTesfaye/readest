import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { FakeReplicaCloud } from '@/__tests__/helpers/fakeReplicaCloud';
import { hlcPack } from '@/libs/crdt';
import type { Hlc, ReplicaRow } from '@/types/replica';

const holder = vi.hoisted(() => ({ cloud: null as FakeReplicaCloud | null }));

vi.mock('@/utils/supabase', () => ({
  createSupabaseClient: () => holder.cloud!.client(),
  createSupabaseAdminClient: () => holder.cloud!.client(),
}));

vi.mock('@/utils/access', () => ({
  validateUserAndToken: async () => ({ user: { id: 'u1' }, token: 'token' }),
}));

vi.mock('@/utils/object', () => ({
  deleteObject: async (fileKey: string) => holder.cloud!.deleteObject(fileKey),
}));

import { POST } from '@/pages/api/sync/replicas';

const USER = 'u1';
const MAP = 'map1';
const md5Of = (digit: string): string => digit.repeat(32);
const versionOf = (digit: string, mapId = MAP): string => `${mapId}.${md5Of(digit)}.json`;
const keyOf = (filename: string, kind = 'mindmap', replicaId = MAP): string =>
  `${USER}/Readest/Replicas/${kind}/${replicaId}/${filename}`;

let counter = 0;
const clock = (device: string, offsetMs = 0): Hlc =>
  hlcPack(Date.now() + offsetMs, counter++, device) as Hlc;

const upsert = (device: string, replicaId = MAP): ReplicaRow => {
  const t = clock(device);
  return {
    user_id: USER,
    kind: 'mindmap',
    replica_id: replicaId,
    fields_jsonb: { bookHash: { v: 'book1', t, s: device } },
    manifest_jsonb: null,
    deleted_at_ts: null,
    reincarnation: null,
    updated_at_ts: t,
    schema_version: 1,
  };
};

const commit = (
  filename: string,
  updatedAt: Hlc,
  kind = 'mindmap',
  replicaId = MAP,
): ReplicaRow => ({
  user_id: USER,
  kind,
  replica_id: replicaId,
  fields_jsonb: {},
  manifest_jsonb: { schemaVersion: 1, files: [{ filename, byteSize: 4, partialMd5: 'x' }] },
  deleted_at_ts: null,
  reincarnation: null,
  updated_at_ts: updatedAt,
  schema_version: 1,
});

const tombstone = (device: string, kind = 'mindmap', replicaId = MAP): ReplicaRow => {
  const t = clock(device);
  return {
    ...upsert(device, replicaId),
    kind,
    fields_jsonb: {},
    deleted_at_ts: t,
    updated_at_ts: t,
  };
};

const push = async (...rows: ReplicaRow[]): Promise<Response> =>
  POST(
    new NextRequest('http://localhost/api/sync/replicas', {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      body: JSON.stringify({ rows }),
    }),
  );

const uploadVersion = (filename: string, kind = 'mindmap', replicaId = MAP): void => {
  holder.cloud!.upload(
    USER,
    `Readest/Replicas/${kind}/${replicaId}/${filename}`,
    'body',
    kind,
    replicaId,
  );
};

const storedKeys = (kind = 'mindmap', replicaId = MAP): string[] =>
  holder
    .cloud!.fileRows(kind, replicaId)
    .map((row) => row.file_key)
    .sort();

const manifestName = (kind = 'mindmap', replicaId = MAP): string | undefined =>
  holder.cloud!.row(USER, kind, replicaId)?.manifest_jsonb?.files[0]?.filename;

beforeEach(() => {
  holder.cloud = new FakeReplicaCloud();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/sync/replicas pruning of replaced mindmap versions', () => {
  test('prunes the version the manifest used to name once a newer one commits', async () => {
    await push(upsert('dev-a'));
    uploadVersion(versionOf('a'));
    await push(commit(versionOf('a'), clock('dev-a')));
    uploadVersion(versionOf('b'));
    const response = await push(commit(versionOf('b'), clock('dev-a')));
    expect(response.status).toBe(200);
    expect(manifestName()).toBe(versionOf('b'));
    expect(storedKeys()).toEqual([keyOf(versionOf('b'))]);
    expect(holder.cloud!.objects.has(keyOf(versionOf('a')))).toBe(false);
  });

  test('prunes the file of a commit that lost to a higher clock and keeps the winner', async () => {
    await push(upsert('dev-a'));
    uploadVersion(versionOf('a'));
    uploadVersion(versionOf('b'));
    await push(commit(versionOf('a'), clock('dev-a', 5_000)));
    await push(commit(versionOf('b'), clock('dev-b')));
    expect(manifestName()).toBe(versionOf('a'));
    expect(storedKeys()).toEqual([keyOf(versionOf('a'))]);
    expect(holder.cloud!.objects.has(keyOf(versionOf('a')))).toBe(true);
  });

  test('never deletes the winning file when the same version is committed again', async () => {
    await push(upsert('dev-a'));
    uploadVersion(versionOf('a'));
    await push(commit(versionOf('a'), clock('dev-a')));
    await push(commit(versionOf('a'), clock('dev-b')));
    expect(storedKeys()).toEqual([keyOf(versionOf('a'))]);
  });

  test('never deletes an upload whose commit has not arrived', async () => {
    await push(upsert('dev-a'));
    uploadVersion(versionOf('a'));
    await push(commit(versionOf('a'), clock('dev-a')));
    uploadVersion(versionOf('c'));
    uploadVersion(versionOf('b'));
    await push(commit(versionOf('b'), clock('dev-a')));
    expect(storedKeys()).toEqual([keyOf(versionOf('b')), keyOf(versionOf('c'))]);
  });

  test('a commit naming a file the server no longer holds never becomes the manifest', async () => {
    await push(upsert('dev-a'));
    uploadVersion(versionOf('a'));
    await push(commit(versionOf('a'), clock('dev-a')));
    uploadVersion(versionOf('b'));
    await push(commit(versionOf('b'), clock('dev-a')));
    const response = await push(commit(versionOf('a'), clock('dev-b', 5_000)));
    expect(response.status).toBe(200);
    expect(manifestName()).toBe(versionOf('b'));
    expect(storedKeys()).toEqual([keyOf(versionOf('b'))]);
  });

  test('a row tombstone deletes every stored version of the map', async () => {
    await push(upsert('dev-a'));
    uploadVersion(versionOf('a'));
    await push(commit(versionOf('a'), clock('dev-a')));
    uploadVersion(versionOf('c'));
    await push(tombstone('dev-b'));
    expect(storedKeys()).toEqual([]);
    expect(holder.cloud!.objects.size).toBe(0);
  });

  test('kinds without pruneReplacedFiles keep every stored file', async () => {
    await push({ ...upsert('dev-a', 'font1'), kind: 'font', fields_jsonb: {} });
    uploadVersion('old.ttf', 'font', 'font1');
    await push(commit('old.ttf', clock('dev-a'), 'font', 'font1'));
    uploadVersion('new.ttf', 'font', 'font1');
    await push(commit('new.ttf', clock('dev-a'), 'font', 'font1'));
    await push(tombstone('dev-a', 'font', 'font1'));
    expect(storedKeys('font', 'font1')).toEqual([
      keyOf('new.ttf', 'font', 'font1'),
      keyOf('old.ttf', 'font', 'font1'),
    ]);
  });

  test('prunes only the pushed map, never another map of the same user', async () => {
    await push(upsert('dev-a'), upsert('dev-a', 'map2'));
    uploadVersion(versionOf('a'));
    uploadVersion(versionOf('e', 'map2'), 'mindmap', 'map2');
    await push(commit(versionOf('e', 'map2'), clock('dev-a'), 'mindmap', 'map2'));
    await push(commit(versionOf('a'), clock('dev-a')));
    await push(tombstone('dev-a'));
    expect(storedKeys('mindmap', 'map2')).toEqual([
      keyOf(versionOf('e', 'map2'), 'mindmap', 'map2'),
    ]);
  });

  test('a failed prune is logged and never fails the push', async () => {
    await push(upsert('dev-a'));
    uploadVersion(versionOf('a'));
    await push(commit(versionOf('a'), clock('dev-a')));
    uploadVersion(versionOf('b'));
    holder.cloud!.failDeletes = true;
    const response = await push(commit(versionOf('b'), clock('dev-a')));
    expect(response.status).toBe(200);
    expect(manifestName()).toBe(versionOf('b'));
    expect(console.error).toHaveBeenCalledWith(
      'replica prune failed',
      expect.objectContaining({ kind: 'mindmap', replicaId: MAP }),
    );
  });

  test('a failed read of the prior manifest commits the row without pruning', async () => {
    await push(upsert('dev-a'));
    uploadVersion(versionOf('a'));
    await push(commit(versionOf('a'), clock('dev-a')));
    uploadVersion(versionOf('b'));
    holder.cloud!.failReads = true;
    const response = await push(commit(versionOf('b'), clock('dev-a')));
    expect(response.status).toBe(200);
    expect(manifestName()).toBe(versionOf('b'));
    expect(storedKeys()).toEqual([keyOf(versionOf('a')), keyOf(versionOf('b'))]);
  });
});
