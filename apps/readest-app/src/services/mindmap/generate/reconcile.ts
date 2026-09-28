import type { GenNode, GenRecord } from '@/services/mindmap/generate/types';
import { NEW_NODE_SIZE } from '@/services/mindmap/layout/layout';
import { keyBetween } from '@/services/mindmap/order/keyBetween';
import { createLinkRecord, createNodeRecord } from '@/services/mindmap/records/defaults';
import type { Point } from '@/services/mindmap/records/geometry';
import type { MapRecord } from '@/services/mindmap/schema/types';
import {
  type Diff,
  type FieldChange,
  fieldsEqual,
  readField,
} from '@/services/mindmap/store/mapStore';

export interface ReconcileDeps {
  createId(): string;
  place(nodes: readonly GenNode[]): ReadonlyMap<string, Point>;
}

const preferred = (a: MapRecord, b: MapRecord): boolean => {
  if ((a.deleted === null) !== (b.deleted === null)) return a.deleted === null;
  if (a.touched.length > 0 !== b.touched.length > 0) return a.touched.length > 0;
  return a.id < b.id;
};

const canonicalByKey = (existing: readonly MapRecord[]): Map<string, MapRecord> => {
  const byKey = new Map<string, MapRecord>();
  for (const record of existing) {
    if (record.genKey === null) continue;
    const current = byKey.get(record.genKey);
    if (!current || preferred(record, current)) byKey.set(record.genKey, record);
  }
  return byKey;
};

const generatedFields = (
  record: GenRecord,
  idOf: (genKey: string) => string | undefined,
): Record<string, unknown> | null => {
  if (record.type === 'node') {
    const { kind, label, color, anchor, revealAt } = record;
    return { kind, label, color, anchor, revealAt };
  }
  const fromId = idOf(record.fromGenKey);
  const toId = idOf(record.toGenKey);
  return fromId && toId ? { fromId, toId, label: record.label } : null;
};

export const reconcile = (
  existing: readonly MapRecord[],
  generated: readonly GenRecord[],
  deps: ReconcileDeps,
): Diff => {
  const seen = new Set<string>();
  const unique = generated.filter((record) => !seen.has(record.genKey) && seen.add(record.genKey));
  const canonical = canonicalByKey(existing);
  const changed: FieldChange[] = [];
  const set = (record: MapRecord, field: string, to: unknown): void => {
    const from = readField(record, field);
    if (!fieldsEqual(from, to)) changed.push({ id: record.id, field, from, to });
  };

  for (const record of existing) {
    if (record.origin !== 'generated' || record.genKey === null || record.deleted !== null)
      continue;
    if (seen.has(record.genKey) && canonical.get(record.genKey) === record) continue;
    if (record.touched.length === 0) {
      set(record, 'deleted', { by: 'gen' });
    } else {
      set(record, 'origin', 'user');
      set(record, 'genKey', null);
    }
  }

  const ids = new Map([...canonical].map(([genKey, record]) => [genKey, record.id]));
  const fresh = unique.filter((record) => !canonical.has(record.genKey));
  for (const record of fresh) ids.set(record.genKey, deps.createId());
  const idOf = (genKey: string): string | undefined => ids.get(genKey);

  for (const record of unique) {
    const current = canonical.get(record.genKey);
    if (!current || current.deleted?.by === 'user') continue;
    const fields = generatedFields(record, idOf);
    if (!fields) continue;
    const revive = current.deleted !== null;
    for (const [field, to] of Object.entries(fields)) {
      if (revive || !current.touched.includes(field)) set(current, field, to);
    }
    if (revive) set(current, 'deleted', null);
  }

  const positions = deps.place(fresh.filter((record): record is GenNode => record.type === 'node'));
  let index = existing.reduce<string | null>(
    (max, record) => (max === null || record.index > max ? record.index : max),
    null,
  );
  const nextIndex = (): string => {
    index = keyBetween(index, null);
    return index;
  };
  const added: MapRecord[] = [];
  for (const record of fresh) {
    const id = idOf(record.genKey)!;
    const origin = { origin: 'generated' as const, genKey: record.genKey };
    if (record.type === 'node') {
      const { kind, label, color, anchor, revealAt } = record;
      const at = positions.get(record.genKey) ?? { x: 0, y: 0 };
      const node = createNodeRecord({
        id,
        index: nextIndex(),
        ...at,
        ...NEW_NODE_SIZE,
        label,
        kind,
        color,
      });
      added.push({ ...node, ...origin, anchor, revealAt });
      continue;
    }
    const fromId = idOf(record.fromGenKey);
    const toId = idOf(record.toGenKey);
    if (!fromId || !toId) continue;
    if (canonical.get(record.fromGenKey)?.deleted || canonical.get(record.toGenKey)?.deleted)
      continue;
    added.push({
      ...createLinkRecord({ id, index: nextIndex(), fromId, toId, label: record.label }),
      ...origin,
    });
  }
  return { added, changed, discarded: [] };
};
