import { canonicalStringify, md5Hex } from '@/services/mindmap/file/canonicalStringify';
import { MINDMAP_BASE_DIR, readMapFile } from '@/services/mindmap/persist/mapFile';
import type { MindmapFs } from '@/services/mindmap/persist/mindmapFs';
import { type MindmapEntry, useMindmapStore } from '@/services/mindmap/persist/mindmapStore';
import { getOpenMapSession } from '@/services/mindmap/persist/session';
import {
  outgoingDir,
  parseVersionFilename,
  versionFilename,
} from '@/services/mindmap/sync/versions';
import type { MindmapReplicaRecord } from '@/services/sync/adapters/mindmap';
import type { ReplicaTransferFile } from '@/store/transferStore';

export const PUSH_DEBOUNCE_MS = 30_000;
export const REPUSH_DELAY_MS = 1_000;

export type PushResult =
  | 'queued'
  | 'not-queued'
  | 'current'
  | 'pending'
  | 'skipped'
  | 'save-failed'
  | 'unreadable'
  | 'unknown-map';

export interface MindmapPushDeps {
  fs: MindmapFs;
  canPush(): Promise<boolean>;
  publishRow(entry: MindmapEntry): Promise<void>;
  queueUpload(record: MindmapReplicaRecord): Promise<string | null>;
  isUploadPending(mapId: string): boolean;
}

export interface MindmapPusher {
  schedule(mapId: string, delayMs?: number): void;
  pushNow(mapId: string): Promise<PushResult>;
  committed(mapId: string, files: ReplicaTransferFile[]): Promise<void>;
  flushAll(): Promise<void>;
  idle(): Promise<void>;
  unpushed(): string[];
  dispose(): void;
}

const UNPUSHED_RESULTS: readonly PushResult[] = ['skipped', 'not-queued', 'save-failed'];

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

const clearOutgoing = async (fs: MindmapFs, dir: string, keep: string): Promise<void> => {
  const items = await fs.readDir(dir, MINDMAP_BASE_DIR).catch((error: unknown) => {
    console.warn('mindmap: cannot list the outgoing directory', { dir, error });
    return [];
  });
  for (const item of items) {
    if (item.path !== keep) await fs.removeFile(`${dir}/${item.path}`, MINDMAP_BASE_DIR);
  }
};

export const createMindmapPusher = (deps: MindmapPushDeps): MindmapPusher => {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const chains = new Map<string, Promise<PushResult>>();
  const waiting = new Set<string>();
  const unpushed = new Set<string>();

  const cancel = (mapId: string): void => {
    const timer = timers.get(mapId);
    if (timer) clearTimeout(timer);
    timers.delete(mapId);
  };

  const push = async (mapId: string): Promise<PushResult> => {
    const entry = useMindmapStore.getState().getEntry(mapId);
    if (!entry) return 'unknown-map';
    if (deps.isUploadPending(mapId)) {
      waiting.add(mapId);
      return 'pending';
    }
    if (!(await deps.canPush())) return 'skipped';
    const session = getOpenMapSession(mapId);
    if (session && !(await session.flush())) return 'save-failed';
    const read = await readMapFile(deps.fs, entry.bookHash, mapId);
    if (!read) return 'unreadable';
    const text = canonicalStringify(read.file);
    const md5 = md5Hex(text);
    if (md5 === useMindmapStore.getState().getEntry(mapId)?.syncedMd5) return 'current';
    const filename = versionFilename(mapId, md5);
    const dir = outgoingDir(entry.bundleDir);
    await deps.fs.createDir(dir, MINDMAP_BASE_DIR, true);
    await clearOutgoing(deps.fs, dir, filename);
    await deps.fs.writeFile(`${dir}/${filename}`, MINDMAP_BASE_DIR, text);
    await deps.publishRow(entry);
    const queued = await deps.queueUpload({
      ...entry,
      contentId: mapId,
      outgoing: { filename, byteSize: byteLength(text) },
    });
    return queued ? 'queued' : 'not-queued';
  };

  const pushNow = (mapId: string): Promise<PushResult> => {
    cancel(mapId);
    const previous = chains.get(mapId) ?? Promise.resolve<PushResult>('current');
    const next = previous
      .catch(() => 'current' as const)
      .then(() => push(mapId))
      .catch((error: unknown): PushResult => {
        console.error('mindmap: push failed', { mapId, error });
        return 'not-queued';
      })
      .then((result) => {
        if (UNPUSHED_RESULTS.includes(result)) unpushed.add(mapId);
        else unpushed.delete(mapId);
        return result;
      });
    chains.set(mapId, next);
    void next.finally(() => {
      if (chains.get(mapId) === next) chains.delete(mapId);
    });
    return next;
  };

  const schedule = (mapId: string, delayMs = PUSH_DEBOUNCE_MS): void => {
    cancel(mapId);
    timers.set(
      mapId,
      setTimeout(() => {
        timers.delete(mapId);
        void pushNow(mapId);
      }, delayMs),
    );
  };

  const committed = async (mapId: string, files: ReplicaTransferFile[]): Promise<void> => {
    const version = files
      .map((file) => parseVersionFilename(file.logical))
      .find((parsed) => parsed?.mapId === mapId);
    const entry = useMindmapStore.getState().getEntry(mapId);
    if (!version || !entry) return;
    useMindmapStore.getState().setSyncedMd5(mapId, version.md5);
    const copy = `${outgoingDir(entry.bundleDir)}/${versionFilename(mapId, version.md5)}`;
    const needed = chains.has(mapId) || deps.isUploadPending(mapId);
    if (!needed && (await deps.fs.exists(copy, MINDMAP_BASE_DIR))) {
      await deps.fs.removeFile(copy, MINDMAP_BASE_DIR);
    }
    const read = await readMapFile(deps.fs, entry.bookHash, mapId);
    const changed = read !== null && md5Hex(canonicalStringify(read.file)) !== version.md5;
    const wasWaiting = waiting.delete(mapId);
    if (changed || wasWaiting) schedule(mapId, REPUSH_DELAY_MS);
  };

  const idle = async (): Promise<void> => {
    while (chains.size > 0) await Promise.all([...chains.values()]);
  };

  return {
    schedule,
    pushNow,
    committed,
    flushAll: async () => {
      await Promise.all([...timers.keys()].map(pushNow));
      await idle();
    },
    idle,
    unpushed: () => [...unpushed],
    dispose: () => {
      for (const mapId of [...timers.keys()]) cancel(mapId);
      waiting.clear();
      unpushed.clear();
    },
  };
};
