import { isSafeMindmapId, mapFileDir } from '@/services/mindmap/persist/mapFile';
import type { MindmapEntry } from '@/services/mindmap/persist/mindmapStore';
import {
  incomingDir,
  noteMindmapManifest,
  outgoingDir,
  versionFilename,
} from '@/services/mindmap/sync/versions';
import type { ReplicaAdapter } from '@/services/sync/replicaRegistry';
import type { ReplicaRow } from '@/types/replica';
import { unwrap } from './helpers';

export const MINDMAP_KIND = 'mindmap';
export const MINDMAP_SCHEMA_VERSION = 1;

export interface MindmapOutgoing {
  filename: string;
  byteSize: number;
}

export interface MindmapReplicaRecord extends MindmapEntry {
  contentId?: string;
  outgoing?: MindmapOutgoing;
}

const bookHashOf = (row: ReplicaRow): string | null => {
  const bookHash = unwrap(row.fields_jsonb['bookHash']);
  return typeof bookHash === 'string' && isSafeMindmapId(bookHash) ? bookHash : null;
};

const bundleDirFor = (row: ReplicaRow): string | null => {
  const bookHash = bookHashOf(row);
  return bookHash && isSafeMindmapId(row.replica_id) ? mapFileDir(bookHash, row.replica_id) : null;
};

export const mindmapAdapter: ReplicaAdapter<MindmapReplicaRecord> = {
  kind: MINDMAP_KIND,
  schemaVersion: MINDMAP_SCHEMA_VERSION,

  pack: (record) => ({ bookHash: record.bookHash }),

  unpack: (fields) => ({
    mapId: '',
    bookHash: String(fields['bookHash'] ?? ''),
    name: '',
    bundleDir: '',
    syncedMd5: null,
  }),

  computeId: async (record) => record.mapId,

  unpackRow: (row, bundleDir) => {
    const bookHash = bookHashOf(row);
    if (!bookHash || !isSafeMindmapId(row.replica_id)) return null;
    return { mapId: row.replica_id, bookHash, name: row.replica_id, bundleDir, syncedMd5: null };
  },

  getDisplayName: (record) => record.name,

  binary: {
    localBaseDir: 'Books',
    enumerateFiles: (record) =>
      record.outgoing
        ? [
            {
              logical: record.outgoing.filename,
              lfp: `${outgoingDir(record.bundleDir)}/${record.outgoing.filename}`,
              byteSize: record.outgoing.byteSize,
            },
          ]
        : [],
    isCurrent: (record, manifestFiles) => {
      const [file] = manifestFiles;
      if (file) noteMindmapManifest(record.mapId, file);
      return (
        manifestFiles.length === 1 &&
        record.syncedMd5 !== null &&
        file?.filename === versionFilename(record.mapId, record.syncedMd5)
      );
    },
    downloadPath: (filename, bundleDir) => `${incomingDir(bundleDir)}/${filename}`,
    bundleDirFor,
    staleWhenMissing: true,
  },
};
