import { hlcCompare, hlcMax, mergeFields } from '@/libs/crdt';
import type { Hlc, Manifest, ReplicaRow } from '@/types/replica';

export interface FakeFileRow {
  id: string;
  user_id: string;
  file_key: string;
  file_size: number;
  replica_kind: string | null;
  replica_id: string | null;
}

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

interface QueryResult<T> {
  data: T;
  error: { message: string } | null;
}

const byteLength = (text: string): number => new TextEncoder().encode(text).length;

const newestFieldClock = (row: ReplicaRow): Hlc | null => {
  let newest: Hlc | null = row.deleted_at_ts;
  for (const envelope of Object.values(row.fields_jsonb)) newest = hlcMax(newest, envelope.t);
  return newest;
};

const mergeManifest = (current: ReplicaRow, incoming: ReplicaRow): Manifest | null => {
  if (incoming.manifest_jsonb === null) return current.manifest_jsonb;
  if (current.manifest_jsonb === null) return incoming.manifest_jsonb;
  return hlcCompare(incoming.updated_at_ts, current.updated_at_ts) > 0
    ? incoming.manifest_jsonb
    : current.manifest_jsonb;
};

interface FakeQuery extends Promise<QueryResult<Row[]>> {
  select(): FakeQuery;
  delete(): FakeQuery;
  eq(column: string, value: unknown): FakeQuery;
  gt(column: string, value: string): FakeQuery;
  in(column: string, values: unknown[]): FakeQuery;
  order(column: string): FakeQuery;
  limit(count: number): FakeQuery;
  maybeSingle(): Promise<QueryResult<Row | null>>;
}

const createQuery = (cloud: FakeReplicaCloud, table: 'replicas' | 'files'): FakeQuery => {
  const filters: Filter[] = [];
  let mode: 'select' | 'delete' = 'select';
  let orderBy: string | null = null;
  let max = Number.POSITIVE_INFINITY;

  const rows = (): Row[] => {
    const source: Row[] =
      table === 'replicas'
        ? [...cloud.replicas.values()].map((row) => ({ ...row }))
        : cloud.files.map((row) => ({ ...row }));
    const matched = source.filter((row) => filters.every((filter) => filter(row)));
    if (orderBy) {
      const column = orderBy;
      matched.sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : 1));
    }
    return matched.slice(0, max);
  };

  const run = (): QueryResult<Row[]> => {
    const matched = rows();
    if (mode === 'delete') {
      if (cloud.failDeletes) return { data: [], error: { message: 'delete failed' } };
      const ids = new Set(matched.map((row) => row['id']));
      cloud.files = cloud.files.filter((row) => !ids.has(row.id));
    }
    return { data: matched, error: null };
  };

  const query = Promise.resolve().then(run) as FakeQuery;
  return Object.assign(query, {
    select: () => query,
    delete: () => {
      mode = 'delete';
      return query;
    },
    eq: (column: string, value: unknown) => {
      filters.push((row) => row[column] === value);
      return query;
    },
    gt: (column: string, value: string) => {
      filters.push((row) => String(row[column]) > value);
      return query;
    },
    in: (column: string, values: unknown[]) => {
      filters.push((row) => values.includes(row[column]));
      return query;
    },
    order: (column: string) => {
      orderBy = column;
      return query;
    },
    limit: (count: number) => {
      max = count;
      return query;
    },
    maybeSingle: async (): Promise<QueryResult<Row | null>> => {
      if (cloud.failReads) return { data: null, error: { message: 'read failed' } };
      return { data: rows()[0] ?? null, error: null };
    },
  });
};

export class FakeReplicaCloud {
  replicas = new Map<string, ReplicaRow>();
  files: FakeFileRow[] = [];
  objects = new Map<string, string>();
  failDeletes = false;
  failObjectDeletes = false;
  failReads = false;
  private nextFileId = 1;

  client() {
    return {
      from: (table: 'replicas' | 'files') => createQuery(this, table),
      rpc: (_name: 'crdt_merge_replica', params: Record<string, unknown>) => ({
        single: async (): Promise<QueryResult<ReplicaRow>> => ({
          data: this.merge(params),
          error: null,
        }),
      }),
    };
  }

  merge(params: Record<string, unknown>): ReplicaRow {
    const incoming: ReplicaRow = {
      user_id: params['p_user_id'] as string,
      kind: params['p_kind'] as string,
      replica_id: params['p_replica_id'] as string,
      fields_jsonb: (params['p_fields_jsonb'] as ReplicaRow['fields_jsonb']) ?? {},
      manifest_jsonb: params['p_manifest_jsonb'] as Manifest | null,
      deleted_at_ts: params['p_deleted_at_ts'] as Hlc | null,
      reincarnation: params['p_reincarnation'] as string | null,
      updated_at_ts: params['p_updated_at_ts'] as Hlc,
      schema_version: params['p_schema_version'] as number,
    };
    const key = `${incoming.user_id}::${incoming.kind}::${incoming.replica_id}`;
    const current = this.replicas.get(key);
    if (!current) {
      this.replicas.set(key, incoming);
      return { ...incoming };
    }
    const merged: ReplicaRow = {
      ...current,
      fields_jsonb: mergeFields(current.fields_jsonb, incoming.fields_jsonb),
      deleted_at_ts: hlcMax(current.deleted_at_ts, incoming.deleted_at_ts),
      manifest_jsonb: mergeManifest(current, incoming),
      schema_version: Math.max(current.schema_version, incoming.schema_version),
    };
    merged.updated_at_ts = [current.updated_at_ts, incoming.updated_at_ts, newestFieldClock(merged)]
      .filter((clock): clock is Hlc => clock !== null)
      .reduce((a, b) => (hlcCompare(a, b) >= 0 ? a : b));
    this.replicas.set(key, merged);
    return { ...merged };
  }

  row(userId: string, kind: string, replicaId: string): ReplicaRow | undefined {
    return this.replicas.get(`${userId}::${kind}::${replicaId}`);
  }

  signUpload(
    userId: string,
    fileName: string,
    fileSize: number,
    replicaKind: string,
    replicaId: string,
  ): { fileKey: string; signedSize: number } {
    const fileKey = `${userId}/${fileName}`;
    const existing = this.files.find((row) => row.user_id === userId && row.file_key === fileKey);
    if (existing) return { fileKey, signedSize: existing.file_size };
    this.files.push({
      id: `f${this.nextFileId++}`,
      user_id: userId,
      file_key: fileKey,
      file_size: fileSize,
      replica_kind: replicaKind,
      replica_id: replicaId,
    });
    return { fileKey, signedSize: fileSize };
  }

  put(fileKey: string, signedSize: number, body: string): void {
    if (byteLength(body) !== signedSize) throw new Error('SignatureDoesNotMatch');
    this.objects.set(fileKey, body);
  }

  upload(userId: string, fileName: string, body: string, kind: string, replicaId: string): void {
    const { fileKey, signedSize } = this.signUpload(
      userId,
      fileName,
      byteLength(body),
      kind,
      replicaId,
    );
    this.put(fileKey, signedSize, body);
  }

  download(userId: string, fileName: string): string {
    const fileKey = `${userId}/${fileName}`;
    const row = this.files.find((file) => file.user_id === userId && file.file_key === fileKey);
    const body = this.objects.get(fileKey);
    if (!row || body === undefined) throw new Error('File not found');
    return body;
  }

  deleteObject(fileKey: string): void {
    if (this.failObjectDeletes) throw new Error('object delete failed');
    this.objects.delete(fileKey);
  }

  rowsWithoutObject(): FakeFileRow[] {
    return this.files.filter((row) => !this.objects.has(row.file_key));
  }

  fileRows(kind: string, replicaId: string): FakeFileRow[] {
    return this.files.filter((row) => row.replica_kind === kind && row.replica_id === replicaId);
  }
}
