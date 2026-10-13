import { describe, expect, test } from 'vitest';
import { KIND_ALLOWLIST, isAllowedKind, validateRow } from '@/libs/replicaSchemas';
import type { Hlc, ReplicaRow } from '@/types/replica';

const HLC = '0000000000064-00000000-dev-a' as Hlc;
const MD5 = '0123456789abcdef0123456789abcdef';

const mapRow = (overrides: Partial<ReplicaRow> = {}): ReplicaRow => ({
  user_id: 'u1',
  kind: 'mindmap',
  replica_id: 'map1',
  fields_jsonb: { bookHash: { v: 'bookhash1', t: HLC, s: 'dev-a' } },
  manifest_jsonb: null,
  deleted_at_ts: null,
  reincarnation: null,
  updated_at_ts: HLC,
  schema_version: 1,
  ...overrides,
});

const rejectedAsInvalid = (row: ReplicaRow): void => {
  expect(validateRow(row)).toMatchObject({ ok: false, code: 'VALIDATION' });
};

const manifestOf = (filename: string): ReplicaRow['manifest_jsonb'] => ({
  schemaVersion: 1,
  files: [{ filename, byteSize: 10, partialMd5: 'x' }],
});

describe('mindmap kind', () => {
  test('is allowed, binary, capped at 1000 rows and flagged for pruning', () => {
    expect(isAllowedKind('mindmap')).toBe(true);
    expect(KIND_ALLOWLIST['mindmap']).toMatchObject({
      binary: true,
      maxRowsPerUser: 1000,
      pruneReplacedFiles: true,
    });
  });

  test('no other kind prunes replaced files', () => {
    const flagged = Object.entries(KIND_ALLOWLIST)
      .filter(([, spec]) => spec.pruneReplacedFiles)
      .map(([kind]) => kind);
    expect(flagged).toEqual(['mindmap']);
  });

  test('accepts a row whose only field is a safe bookHash', () => {
    expect(validateRow(mapRow())).toEqual({ ok: true });
  });

  test('accepts a manifest commit and a tombstone with no fields', () => {
    expect(
      validateRow(mapRow({ fields_jsonb: {}, manifest_jsonb: manifestOf(`map1.${MD5}.json`) })),
    ).toEqual({ ok: true });
    expect(validateRow(mapRow({ fields_jsonb: {}, deleted_at_ts: HLC }))).toEqual({ ok: true });
  });

  test('rejects any field other than bookHash, so titles never reach the row', () => {
    const row = mapRow();
    row.fields_jsonb['title'] = { v: 'Secret', t: HLC, s: 'dev-a' };
    rejectedAsInvalid(row);
  });

  test.each(['', '../x', 'a/b', 'x'.repeat(65), 7])('rejects the bookHash %j', (bookHash) => {
    rejectedAsInvalid(mapRow({ fields_jsonb: { bookHash: { v: bookHash, t: HLC, s: 'dev-a' } } }));
  });

  test.each(['', '..', 'a.b', 'a/b', 'x'.repeat(65)])('rejects the replica id %j', (replicaId) => {
    rejectedAsInvalid(mapRow({ replica_id: replicaId }));
  });

  test.each([
    'map1.json',
    `map2.${MD5}.json`,
    `map1.${MD5.toUpperCase()}.json`,
    `map1.${MD5}.bin`,
    `map1.${MD5.slice(1)}.json`,
  ])('rejects the manifest filename %s', (filename) => {
    rejectedAsInvalid(mapRow({ manifest_jsonb: manifestOf(filename) }));
  });

  test('rejects a manifest that names more than one version', () => {
    const row = mapRow({
      manifest_jsonb: {
        schemaVersion: 1,
        files: [
          { filename: `map1.${MD5}.json`, byteSize: 1, partialMd5: 'x' },
          { filename: `map1.${'f'.repeat(32)}.json`, byteSize: 1, partialMd5: 'x' },
        ],
      },
    });
    rejectedAsInvalid(row);
  });

  test('rejects a manifest that names no version', () => {
    rejectedAsInvalid(mapRow({ manifest_jsonb: { schemaVersion: 1, files: [] } }));
  });

  test('leaves other kinds free to use any replica id and filename', () => {
    const row = mapRow({
      kind: 'font',
      replica_id: 'content.hash',
      fields_jsonb: {},
      manifest_jsonb: manifestOf('Font Name.ttf'),
    });
    expect(validateRow(row)).toEqual({ ok: true });
  });
});
