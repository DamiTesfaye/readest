import type { MapRecord } from '@/services/mindmap/schema/types';

export type DiffSource = 'local' | 'remote' | 'generated';

export interface FieldChange {
  id: string;
  field: string;
  from: unknown;
  to: unknown;
}

export interface Diff {
  added: MapRecord[];
  changed: FieldChange[];
  discarded: string[];
}

type PatchOf<R> = R extends MapRecord ? Partial<Omit<R, 'id' | 'type'>> : never;

export type RecordPatch = PatchOf<MapRecord>;

export type StoreListener = (diff: Diff, source: DiffSource) => void;

export interface MapStore {
  get(id: string): MapRecord | undefined;
  all(): MapRecord[];
  put(records: MapRecord[]): Diff;
  update(id: string, patch: RecordPatch): Diff;
  setFields(changes: FieldChange[]): Diff;
  remove(ids: string[], by: 'user' | 'gen'): Diff;
  discard(ids: string[]): Diff;
  applyRemote(diff: Diff): Diff;
  applyGenerated(diff: Diff): Diff;
  listen(listener: StoreListener): () => void;
}

export const emptyDiff = (): Diff => ({ added: [], changed: [], discarded: [] });

export const isEmptyDiff = (diff: Diff): boolean =>
  diff.added.length === 0 && diff.changed.length === 0 && diff.discarded.length === 0;

export const fieldsEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && fieldsEqual(left[key], right[key]))
  );
};

export const recordFields = (record: MapRecord): Record<string, unknown> =>
  record as unknown as Record<string, unknown>;

export const readField = (record: MapRecord, field: string): unknown => recordFields(record)[field];

const recordChanges = (before: MapRecord, after: MapRecord): FieldChange[] => {
  const changes: FieldChange[] = [];
  for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const from = readField(before, field);
    const to = readField(after, field);
    if (field !== 'id' && !fieldsEqual(from, to)) changes.push({ id: after.id, field, from, to });
  }
  return changes;
};

export const diffRecords = (before: readonly MapRecord[], after: readonly MapRecord[]): Diff => {
  const previous = new Map<string, MapRecord>(before.map((record) => [record.id, record]));
  const remaining = new Set(after.map((record) => record.id));
  const diff = emptyDiff();
  for (const record of after) {
    const old = previous.get(record.id);
    if (old) diff.changed.push(...recordChanges(old, record));
    else diff.added.push(record);
  }
  diff.discarded.push(...before.filter((record) => !remaining.has(record.id)).map((r) => r.id));
  return diff;
};

export const createMapStore = (initial: MapRecord[]): MapStore => {
  let records = new Map<string, MapRecord>(initial.map((record) => [record.id, record]));
  let snapshot: MapRecord[] | null = null;
  const listeners = new Set<StoreListener>();

  const apply = (input: Diff, source: DiffSource): Diff => {
    const next = new Map(records);
    const diff = emptyDiff();
    for (const record of input.added) {
      const existing = next.get(record.id);
      if (existing) diff.changed.push(...recordChanges(existing, record));
      else diff.added.push(record);
      next.set(record.id, record);
    }
    for (const change of input.changed) {
      const existing = next.get(change.id);
      if (!existing || change.field === 'id' || change.to === undefined) continue;
      const from = readField(existing, change.field);
      if (fieldsEqual(from, change.to)) continue;
      diff.changed.push({ id: change.id, field: change.field, from, to: change.to });
      next.set(change.id, { ...existing, [change.field]: change.to } as MapRecord);
    }
    for (const id of input.discarded) {
      if (next.delete(id)) diff.discarded.push(id);
    }
    if (isEmptyDiff(diff)) return diff;
    records = next;
    snapshot = null;
    for (const listener of [...listeners]) listener(diff, source);
    return diff;
  };

  const setFields = (changes: FieldChange[]): Diff =>
    apply({ added: [], changed: changes, discarded: [] }, 'local');

  return {
    get: (id) => records.get(id),
    all: () => {
      snapshot ??= [...records.values()];
      return snapshot;
    },
    put: (incoming) => apply({ added: incoming, changed: [], discarded: [] }, 'local'),
    update: (id, patch) =>
      setFields(
        Object.entries(patch as Record<string, unknown>).map(([field, to]) => ({
          id,
          field,
          from: undefined,
          to,
        })),
      ),
    setFields,
    remove: (ids, by) =>
      setFields(
        ids
          .filter((id) => records.get(id)?.deleted === null)
          .map((id) => ({ id, field: 'deleted', from: null, to: { by } })),
      ),
    discard: (ids) => apply({ added: [], changed: [], discarded: ids }, 'local'),
    applyRemote: (diff) => apply(diff, 'remote'),
    applyGenerated: (diff) => apply(diff, 'generated'),
    listen: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
