import { canonicalStringify, md5Hex } from '@/services/mindmap/file/canonicalStringify';
import { type HlcClock, observeFileClock } from '@/services/mindmap/file/clock';
import { mergeMapFiles } from '@/services/mindmap/file/mergeMapFiles';
import { parseMapFile } from '@/services/mindmap/file/parseMapFile';
import {
  MINDMAP_BASE_DIR,
  mapFilePath,
  readMapFile,
  setUnreadableMapAside,
} from '@/services/mindmap/persist/mapFile';
import { saveMap } from '@/services/mindmap/persist/maps';
import type { MindmapFs } from '@/services/mindmap/persist/mindmapFs';
import { type MindmapEntry, useMindmapStore } from '@/services/mindmap/persist/mindmapStore';
import { whenMapSessionSettled } from '@/services/mindmap/persist/session';
import { CURRENT_SCHEMA_VERSION, type MapFile } from '@/services/mindmap/schema/types';
import { decodeMeta } from '@/services/mindmap/schema/validate';
import {
  type MapVersion,
  markMindmapVersionKnown,
  parseVersionFilename,
  unmergedMindmapVersion,
} from '@/services/mindmap/sync/versions';
import type { ReplicaTransferFile } from '@/store/transferStore';
import type { ManifestFile } from '@/types/replica';
import { md5 } from '@/utils/md5';

export type MergeOutcome =
  | 'merged'
  | 'corrupt'
  | 'unparseable'
  | 'newer-schema'
  | 'read-only'
  | 'save-failed'
  | 'local-unreadable'
  | 'missing'
  | 'unknown-map';

export interface MindmapMergeDeps {
  fs: MindmapFs;
  clock(): HlcClock;
  schedulePush(mapId: string): void;
  queueDownload(entry: MindmapEntry, file: ManifestFile): void;
}

interface IncomingVersion extends MapVersion {
  path: string;
  text: string;
  bytesMd5: string;
}

type LocalMerge = { outcome: 'merged'; text: string; file: MapFile } | { outcome: MergeOutcome };

const readIncoming = async (
  fs: MindmapFs,
  mapId: string,
  files: ReplicaTransferFile[],
): Promise<IncomingVersion | null> => {
  for (const file of files) {
    const version = parseVersionFilename(file.logical);
    if (version?.mapId !== mapId) continue;
    if (!(await fs.exists(file.lfp, MINDMAP_BASE_DIR))) return null;
    const content = await fs.readFile(file.lfp, MINDMAP_BASE_DIR, 'binary');
    if (typeof content === 'string') {
      return { ...version, path: file.lfp, text: content, bytesMd5: md5Hex(content) };
    }
    const bytes = new Uint8Array(content);
    return {
      ...version,
      path: file.lfp,
      text: new TextDecoder().decode(bytes),
      bytesMd5: md5(bytes),
    };
  }
  return null;
};

const discard = async (fs: MindmapFs, path: string): Promise<void> => {
  if (await fs.exists(path, MINDMAP_BASE_DIR)) await fs.removeFile(path, MINDMAP_BASE_DIR);
};

const mergeIntoSession = async (mapId: string, remote: MapFile): Promise<LocalMerge | null> => {
  const session = await whenMapSessionSettled(mapId);
  if (!session) return null;
  const result = session.mergeRemote(remote);
  if (result !== 'merged') return { outcome: result };
  if (!(await session.flush())) return { outcome: 'save-failed' };
  return { outcome: 'merged', text: canonicalStringify(session.file()), file: session.file() };
};

const mergeOnDisk = async (
  deps: MindmapMergeDeps,
  entry: MindmapEntry,
  remote: MapFile,
): Promise<LocalMerge> => {
  const read = await readMapFile(deps.fs, entry.bookHash, entry.mapId);
  if (!read && (await deps.fs.exists(mapFilePath(entry.bookHash, entry.mapId), MINDMAP_BASE_DIR))) {
    try {
      await setUnreadableMapAside(deps.fs, entry.bookHash, entry.mapId);
    } catch (error) {
      console.error('mindmap: could not move an unreadable map aside', {
        mapId: entry.mapId,
        error,
      });
      return { outcome: 'local-unreadable' };
    }
    console.warn('mindmap: restored a map that cannot be read from its synced version', {
      mapId: entry.mapId,
    });
  }
  if (read && read.file.schemaVersion > CURRENT_SCHEMA_VERSION) return { outcome: 'newer-schema' };
  observeFileClock(deps.clock(), remote);
  const merged = read ? mergeMapFiles(read.file, remote) : remote;
  try {
    return {
      outcome: 'merged',
      text: await saveMap(deps.fs, entry.bookHash, merged),
      file: merged,
    };
  } catch (error) {
    console.error('mindmap: failed to save a merged map', error);
    return { outcome: 'save-failed' };
  }
};

const mergeClosedMap = async (
  deps: MindmapMergeDeps,
  entry: MindmapEntry,
  remote: MapFile,
): Promise<LocalMerge> => {
  const onDisk = await mergeOnDisk(deps, entry, remote);
  if (!('text' in onDisk)) return onDisk;
  return (await mergeIntoSession(entry.mapId, onDisk.file)) ?? onDisk;
};

const SETTLED_OUTCOMES: readonly MergeOutcome[] = [
  'merged',
  'corrupt',
  'unparseable',
  'newer-schema',
  'read-only',
];

const queueNewerVersion = (deps: MindmapMergeDeps, mapId: string): void => {
  const entry = useMindmapStore.getState().getEntry(mapId);
  const latest = entry ? unmergedMindmapVersion(mapId, entry.syncedMd5) : undefined;
  if (entry && latest) deps.queueDownload(entry, latest);
};

const mergeIncoming = async (
  deps: MindmapMergeDeps,
  mapId: string,
  files: ReplicaTransferFile[],
): Promise<MergeOutcome> => {
  const store = useMindmapStore.getState();
  const entry = store.getEntry(mapId);
  if (!entry) return 'unknown-map';
  const incoming = await readIncoming(deps.fs, mapId, files);
  if (!incoming) return 'missing';
  if (incoming.bytesMd5 !== incoming.md5) {
    console.warn('mindmap: discarded a download that does not match its name', { mapId });
    await discard(deps.fs, incoming.path);
    return 'corrupt';
  }
  const remote = parseMapFile(incoming.text, mapId);
  if (!remote) {
    console.warn('mindmap: discarded a version that cannot be parsed', { mapId });
    store.setSyncedMd5(mapId, incoming.md5);
    await discard(deps.fs, incoming.path);
    deps.schedulePush(mapId);
    return 'unparseable';
  }
  if (remote.schemaVersion > CURRENT_SCHEMA_VERSION) {
    console.warn('mindmap: a newer app wrote this version; keeping it for later', { mapId });
    return 'newer-schema';
  }
  const result =
    (await mergeIntoSession(mapId, remote)) ?? (await mergeClosedMap(deps, entry, remote));
  if (!('text' in result)) return result.outcome;
  store.setSyncedMd5(mapId, incoming.md5);
  const current = useMindmapStore.getState().getEntry(mapId);
  const title = decodeMeta(result.file.meta).title;
  if (current && current.name !== title) store.upsertEntry({ ...current, name: title });
  await discard(deps.fs, incoming.path);
  if (md5Hex(result.text) !== incoming.md5) deps.schedulePush(mapId);
  return 'merged';
};

export const mergeIncomingVersion = async (
  deps: MindmapMergeDeps,
  mapId: string,
  files: ReplicaTransferFile[],
): Promise<MergeOutcome> => {
  const outcome = await mergeIncoming(deps, mapId, files);
  if (SETTLED_OUTCOMES.includes(outcome)) {
    for (const file of files) markMindmapVersionKnown(file.logical);
  }
  if (outcome === 'merged') queueNewerVersion(deps, mapId);
  return outcome;
};
