import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HlcGenerator, hlcPack } from '@/libs/crdt';
import { SyncError } from '@/libs/errors';
import { ReplicaSyncManager } from '@/services/sync/replicaSyncManager';
import type { Hlc, ReplicaRow } from '@/types/replica';

const NOW = 1_700_000_000_000;
const DEV = 'dev-a';
const HLC_NOW = hlcPack(NOW, 0, DEV) as Hlc;
const SERVER_KINDS = new Set(['dictionary', 'font', 'texture', 'opds_catalog', 'settings']);

const makeRow = (kind: string, id: string, hlc: Hlc = HLC_NOW): ReplicaRow => ({
  user_id: 'u1',
  kind,
  replica_id: id,
  fields_jsonb: { name: { v: id, t: hlc, s: DEV } },
  manifest_jsonb: null,
  deleted_at_ts: null,
  reincarnation: null,
  updated_at_ts: hlc,
  schema_version: 1,
});

const unknownKind = (index: number, kind: string): SyncError =>
  new SyncError('UNKNOWN_KIND', `kind=${kind} is not in the server allowlist`, {
    status: 422,
    offendingIndex: index,
  });

const makeServerWithoutMindmap = (rowsByKind: Record<string, ReplicaRow[]> = {}) => {
  const stored: ReplicaRow[] = [];
  return {
    stored,
    push: vi.fn(async (rows: ReplicaRow[]) => {
      const index = rows.findIndex((row) => !SERVER_KINDS.has(row.kind));
      if (index >= 0) throw unknownKind(index, rows[index]!.kind);
      stored.push(...rows);
      return rows;
    }),
    pull: vi.fn(async (kind: string, _since: Hlc | null) => {
      if (!SERVER_KINDS.has(kind)) {
        throw new SyncError('UNKNOWN_KIND', `kind=${kind} is not in the server allowlist`, {
          status: 422,
        });
      }
      return rowsByKind[kind] ?? [];
    }),
    pullBatch: vi.fn(async (cursors: { kind: string; since: Hlc | null }[]) => {
      const index = cursors.findIndex((cursor) => !SERVER_KINDS.has(cursor.kind));
      if (index >= 0) throw unknownKind(index, cursors[index]!.kind);
      return cursors.map(({ kind }) => ({ kind, rows: rowsByKind[kind] ?? [] }));
    }),
  };
};

const makeManager = (client: ReturnType<typeof makeServerWithoutMindmap>) => {
  const cursors = new Map<string, Hlc>();
  const manager = new ReplicaSyncManager({
    hlc: new HlcGenerator(DEV, () => NOW),
    client,
    debounceMs: 5000,
    cursorStore: {
      get: (kind) => cursors.get(kind) ?? null,
      set: (kind, hlc) => {
        cursors.set(kind, hlc);
      },
    },
  });
  return { manager, cursors };
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ReplicaSyncManager against a server that does not know a kind', () => {
  test('a batched pull still returns every other kind and skips the unknown one afterwards', async () => {
    const font = makeRow('font', 'f1', hlcPack(NOW + 10, 0, DEV) as Hlc);
    const client = makeServerWithoutMindmap({ font: [font] });
    const { manager, cursors } = makeManager(client);

    const rows = await manager.pullMany(['dictionary', 'mindmap', 'font'], { since: null });

    expect(rows.get('font')).toEqual([font]);
    expect(rows.get('dictionary')).toEqual([]);
    expect(rows.get('mindmap')).toEqual([]);
    expect(cursors.get('font')).toBe(font.updated_at_ts);
    expect(client.pullBatch).toHaveBeenCalledTimes(2);
    expect(client.pullBatch.mock.calls[1]![0].map((cursor) => cursor.kind)).toEqual([
      'dictionary',
      'font',
    ]);
    expect(manager.isKindSupported('mindmap')).toBe(false);
    expect(manager.isKindSupported('font')).toBe(true);

    await manager.pullMany(['mindmap', 'font']);
    expect(client.pullBatch).toHaveBeenCalledTimes(3);
    expect(client.pullBatch.mock.calls[2]![0].map((cursor) => cursor.kind)).toEqual(['font']);

    await manager.pullMany(['mindmap']);
    expect(client.pullBatch).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledOnce();
  });

  test('a push batch still pushes every other kind and keeps the unknown rows dirty without resending them', async () => {
    const client = makeServerWithoutMindmap();
    const { manager } = makeManager(client);
    manager.markDirty(makeRow('dictionary', 'd1'));
    manager.markDirty(makeRow('mindmap', 'm1'));
    manager.markDirty(makeRow('font', 'f1'));

    await manager.flush();

    expect(client.push).toHaveBeenCalledTimes(2);
    expect(client.stored.map((row) => row.kind)).toEqual(['dictionary', 'font']);
    expect(manager.pendingKeys()).toEqual([{ kind: 'mindmap', replicaId: 'm1' }]);

    manager.markDirty(makeRow('mindmap', 'm2'));
    await manager.flush();
    expect(client.push).toHaveBeenCalledTimes(2);

    manager.markDirty(makeRow('texture', 't1'));
    await manager.flush();
    expect(client.push).toHaveBeenCalledTimes(3);
    expect(client.push.mock.calls[2]![0].map((row) => row.kind)).toEqual(['texture']);
    expect(warn).toHaveBeenCalledOnce();
  });

  test('an unknown kind found by a push is left out of later pulls', async () => {
    const client = makeServerWithoutMindmap();
    const { manager } = makeManager(client);
    manager.markDirty(makeRow('mindmap', 'm1'));
    await manager.flush();
    expect(client.push).toHaveBeenCalledOnce();

    await manager.pullMany(['mindmap', 'dictionary']);
    expect(client.pullBatch).toHaveBeenCalledOnce();
    expect(client.pullBatch.mock.calls[0]![0].map((cursor) => cursor.kind)).toEqual(['dictionary']);
  });

  test('a single-kind pull of an unknown kind returns no rows and is not repeated', async () => {
    const client = makeServerWithoutMindmap();
    const { manager } = makeManager(client);
    expect(await manager.pull('mindmap', { since: null })).toEqual([]);
    expect(await manager.pull('mindmap')).toEqual([]);
    expect(client.pull).toHaveBeenCalledOnce();
    expect(manager.isKindSupported('mindmap')).toBe(false);
  });

  test('other failures and UNKNOWN_KIND without an index are still thrown', async () => {
    const client = makeServerWithoutMindmap();
    client.pullBatch.mockRejectedValueOnce(new SyncError('UNKNOWN_KIND', 'no index'));
    client.push.mockRejectedValueOnce(new SyncError('SERVER', 'down', { status: 500 }));
    const { manager } = makeManager(client);
    await expect(manager.pullMany(['dictionary'])).rejects.toMatchObject({ code: 'UNKNOWN_KIND' });
    manager.markDirty(makeRow('dictionary', 'd1'));
    await expect(manager.flush()).rejects.toMatchObject({ code: 'SERVER' });
    expect(manager.pendingCount()).toBe(1);
    expect(manager.isKindSupported('dictionary')).toBe(true);
  });
});
