import { describe, expect, it } from 'vitest';
import { HlcGenerator } from '@/libs/crdt';
import type { FieldEnvelope, FieldsObject, Hlc } from '@/types/replica';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import {
  CURRENT_RECORD_VERSION,
  type MigrationConfig,
  RECORD_MIGRATIONS,
  migrateMapFile,
} from '@/services/mindmap/schema/migrations';
import { CURRENT_SCHEMA_VERSION, type MapFile } from '@/services/mindmap/schema/types';

const T = '0000000000001-00000000-d1' as Hlc;

const envelope = (v: unknown): FieldEnvelope => ({ v, t: T, s: 'd1' });

const clock = () => createMindmapClock(new HlcGenerator('device-1'), 'device-1');

const nodeV1 = (): FieldsObject => ({
  type: envelope('node'),
  version: envelope(1),
  label: envelope('old label'),
  x: envelope(5),
});

const fileWith = (
  records: Record<string, FieldsObject>,
  schemaVersion = CURRENT_SCHEMA_VERSION,
): MapFile => ({
  schemaVersion,
  mapId: 'm1',
  meta: {},
  records,
});

const toV2: MigrationConfig = {
  migrations: {
    ...RECORD_MIGRATIONS,
    node: [(fields) => ({ ...fields, label: `${String(fields['label'])}!` })],
  },
  targetVersions: { ...CURRENT_RECORD_VERSION, node: 2 },
};

describe('migrateMapFile', () => {
  it('returns the same file when nothing needs migrating', () => {
    const file = fileWith({ n1: nodeV1() });
    expect(migrateMapFile(file, clock())).toBe(file);
  });

  it('bumps an older schemaVersion', () => {
    expect(migrateMapFile(fileWith({}, 0), clock()).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('never downgrades a newer schemaVersion', () => {
    const file = fileWith({ n1: nodeV1() }, CURRENT_SCHEMA_VERSION + 1);
    expect(migrateMapFile(file, clock(), toV2)).toBe(file);
  });

  it('runs migrations, bumps the record version and restamps only what changed', () => {
    const original = nodeV1();
    const migrated = migrateMapFile(fileWith({ n1: original }), clock(), toV2).records['n1']!;
    expect(migrated['label']!.v).toBe('old label!');
    expect(migrated['label']!.t > T).toBe(true);
    expect(migrated['version']).toMatchObject({ v: 2, s: 'device-1' });
    expect(migrated['version']!.t > T).toBe(true);
    expect(migrated['x']).toBe(original['x']);
  });

  it('restamps a migrated field above its far-future clock', () => {
    const future = '1ffffffffffff-00000002-dx' as Hlc;
    const original = { ...nodeV1(), label: { v: 'old label', t: future, s: 'dx' } };
    const migrated = migrateMapFile(fileWith({ n1: original }), clock(), toV2).records['n1']!;
    expect(migrated['label']).toMatchObject({ v: 'old label!', s: 'device-1' });
    expect(migrated['label']!.t > future).toBe(true);
  });

  it('does not run a migration again on a migrated record', () => {
    const once = migrateMapFile(fileWith({ n1: nodeV1() }), clock(), toV2);
    expect(migrateMapFile(once, clock(), toV2)).toBe(once);
  });

  it('leaves records from a newer build and records of unknown type untouched', () => {
    const newer: FieldsObject = { ...nodeV1(), version: envelope(3) };
    const unknown: FieldsObject = { type: envelope('constructor'), version: envelope(1) };
    const migrated = migrateMapFile(fileWith({ n1: newer, x1: unknown }), clock(), toV2);
    expect(migrated.records['n1']).toBe(newer);
    expect(migrated.records['x1']).toBe(unknown);
  });

  it('throws when a step is missing or a migration throws', () => {
    const missing: MigrationConfig = {
      ...toV2,
      targetVersions: { ...CURRENT_RECORD_VERSION, node: 3 },
    };
    expect(() => migrateMapFile(fileWith({ n1: nodeV1() }), clock(), missing)).toThrow(
      'no node migration from version 2',
    );
    const throwing: MigrationConfig = {
      ...toV2,
      migrations: {
        ...RECORD_MIGRATIONS,
        node: [
          () => {
            throw new Error('boom');
          },
        ],
      },
    };
    expect(() => migrateMapFile(fileWith({ n1: nodeV1() }), clock(), throwing)).toThrow('boom');
  });
});
