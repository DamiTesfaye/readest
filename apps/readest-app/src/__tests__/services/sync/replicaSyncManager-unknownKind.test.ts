import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HlcGenerator } from '@/libs/crdt';
import { SyncError } from '@/libs/errors';
import { ReplicaSyncManager } from '@/services/sync/replicaSyncManager';
import type { Hlc, ReplicaRow } from '@/types/replica';

const NOW = 1_700_000_000_000;
const DEV = 'dev-a';
const SERVER_KINDS = new Set(['dictionary', 'font', 'texture', 'opds_catalog', 'settings']);

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

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ReplicaSyncManager against a server that does not know a kind', () => {
  test('a single-kind pull of an unknown kind returns no rows and is not repeated', async () => {
    const client = makeServerWithoutMindmap();
    const { manager } = makeManager(client);
    expect(await manager.pull('mindmap', { since: null })).toEqual([]);
    expect(await manager.pull('mindmap')).toEqual([]);
    expect(client.pull).toHaveBeenCalledOnce();
    expect(manager.isKindSupported('mindmap')).toBe(false);
  });
});
