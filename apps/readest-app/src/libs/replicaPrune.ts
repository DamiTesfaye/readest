import type { SupabaseClient } from '@supabase/supabase-js';
import { isReplicaRowAlive } from '@/libs/replicaInterpret';
import { CLOUD_REPLICAS_SUBDIR } from '@/services/constants';
import type { Manifest, ReplicaRow } from '@/types/replica';
import { deleteObject } from '@/utils/object';

export interface StoredReplicaFile {
  id: string;
  file_key: string;
}

export interface ReplicaFileStore {
  priorManifest(row: ReplicaRow): Promise<Manifest | null>;
  listFiles(row: ReplicaRow): Promise<StoredReplicaFile[]>;
  deleteFiles(files: StoredReplicaFile[]): Promise<void>;
}

export interface PreparedPrune {
  row: ReplicaRow;
  finish(winner: ReplicaRow): Promise<void>;
}

type ReplicaIdentity = Pick<ReplicaRow, 'user_id' | 'kind' | 'replica_id'>;

export const replicaFileKey = (row: ReplicaIdentity, filename: string): string =>
  `${row.user_id}/${CLOUD_REPLICAS_SUBDIR}/${row.kind}/${row.replica_id}/${filename}`;

const filenamesOf = (manifest: Manifest | null): string[] =>
  manifest?.files.map((file) => file.filename) ?? [];

export const filesToPrune = (
  winner: ReplicaRow,
  prior: Manifest | null,
  pushed: Manifest | null,
  stored: StoredReplicaFile[],
): StoredReplicaFile[] => {
  if (!isReplicaRowAlive(winner)) return stored;
  const kept = new Set(filenamesOf(winner.manifest_jsonb));
  const replaced = new Set(
    [...filenamesOf(prior), ...filenamesOf(pushed)]
      .filter((filename) => !kept.has(filename))
      .map((filename) => replicaFileKey(winner, filename)),
  );
  return stored.filter((file) => replaced.has(file.file_key));
};

export const committableRow = (row: ReplicaRow, stored: StoredReplicaFile[]): ReplicaRow => {
  if (!row.manifest_jsonb) return row;
  const keys = new Set(stored.map((file) => file.file_key));
  const complete = row.manifest_jsonb.files.every((file) =>
    keys.has(replicaFileKey(row, file.filename)),
  );
  return complete ? row : { ...row, manifest_jsonb: null };
};

const logFailure = (row: ReplicaRow, error: unknown): void => {
  console.error('replica prune failed', { kind: row.kind, replicaId: row.replica_id, error });
};

export const prepareReplicaPrune = async (
  store: ReplicaFileStore,
  row: ReplicaRow,
): Promise<PreparedPrune> => {
  try {
    const [prior, stored] = await Promise.all([store.priorManifest(row), store.listFiles(row)]);
    return {
      row: committableRow(row, stored),
      finish: async (winner) => {
        const doomed = filesToPrune(winner, prior, row.manifest_jsonb, stored);
        if (doomed.length === 0) return;
        try {
          await store.deleteFiles(doomed);
        } catch (error) {
          logFailure(row, error);
        }
      },
    };
  } catch (error) {
    logFailure(row, error);
    return { row, finish: async () => {} };
  }
};

export const createReplicaFileStore = (
  replicas: SupabaseClient,
  files: SupabaseClient,
): ReplicaFileStore => ({
  priorManifest: async (row) => {
    const { data, error } = await replicas
      .from('replicas')
      .select('manifest_jsonb')
      .eq('user_id', row.user_id)
      .eq('kind', row.kind)
      .eq('replica_id', row.replica_id)
      .maybeSingle<{ manifest_jsonb: Manifest | null }>();
    if (error) throw new Error(`read prior manifest failed: ${error.message}`);
    return data?.manifest_jsonb ?? null;
  },
  listFiles: async (row) => {
    const { data, error } = await files
      .from('files')
      .select('id, file_key')
      .eq('user_id', row.user_id)
      .eq('replica_kind', row.kind)
      .eq('replica_id', row.replica_id);
    if (error) throw new Error(`list replica files failed: ${error.message}`);
    return (data ?? []) as StoredReplicaFile[];
  },
  deleteFiles: async (doomed) => {
    const { error } = await files
      .from('files')
      .delete()
      .in(
        'id',
        doomed.map((file) => file.id),
      );
    if (error) throw new Error(`delete replica files failed: ${error.message}`);
    for (const file of doomed) await deleteObject(file.file_key);
  },
});
