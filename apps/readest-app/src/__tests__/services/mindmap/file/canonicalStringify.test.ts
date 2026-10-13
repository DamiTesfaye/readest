import { describe, expect, it } from 'vitest';
import type { FieldEnvelope, FieldsObject, Hlc } from '@/types/replica';
import type { MapFile } from '@/services/mindmap/schema/types';
import { canonicalStringify, md5Hex } from '@/services/mindmap/file/canonicalStringify';

const T1 = '0000000000001-00000000-d1' as Hlc;
const T5 = '0000000000005-00000000-d1' as Hlc;

const envelope = (v: unknown, t: Hlc = T1): FieldEnvelope => ({ v, t, s: 'd1' });

const fileWith = (records: Record<string, FieldsObject>): MapFile => ({
  schemaVersion: 1,
  mapId: 'm1',
  meta: {},
  records,
});

describe('canonicalStringify', () => {
  it('is insensitive to key insertion order', () => {
    const a: MapFile = {
      schemaVersion: 1,
      mapId: 'm1',
      meta: {},
      records: { n1: { type: envelope('node'), label: envelope('x') } },
    };
    const b: MapFile = {
      records: { n1: { label: envelope('x'), type: envelope('node') } },
      meta: {},
      mapId: 'm1',
      schemaVersion: 1,
    };
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
  });

  it('writes only the four file keys with no whitespace', () => {
    const text = canonicalStringify({ ...fileWith({}), extra: true } as MapFile);
    expect(text).toBe('{"mapId":"m1","meta":{},"records":{},"schemaVersion":1}');
  });

  it('nulls the content fields of deleted records and keeps their clocks', () => {
    const file = fileWith({
      n1: {
        type: envelope('node'),
        deleted: envelope({ by: 'user' }),
        label: envelope('secret', T5),
        x: envelope(10),
      },
      l1: {
        type: envelope('link'),
        deleted: envelope({ by: 'gen' }),
        fromId: envelope('n1'),
        toId: envelope('n2'),
        label: envelope('knows'),
      },
      i1: { type: envelope('ink'), deleted: envelope({ by: 'user' }), points: envelope('AAAA') },
    });
    const parsed = JSON.parse(canonicalStringify(file));
    expect(parsed.records.n1.label).toEqual({ s: 'd1', t: T5, v: null });
    expect(parsed.records.n1.x.v).toBe(10);
    expect([
      parsed.records.l1.fromId.v,
      parsed.records.l1.toId.v,
      parsed.records.l1.label.v,
    ]).toEqual([null, null, null]);
    expect(parsed.records.i1.points.v).toBeNull();
  });

  it('leaves live records and the in-memory file untouched', () => {
    const deleted: FieldsObject = {
      type: envelope('node'),
      deleted: envelope({ by: 'user' }),
      label: envelope('secret'),
    };
    const live: FieldsObject = {
      type: envelope('node'),
      deleted: envelope(null),
      label: envelope('visible'),
    };
    const parsed = JSON.parse(canonicalStringify(fileWith({ n1: deleted, n2: live })));
    expect(parsed.records.n2.label.v).toBe('visible');
    expect(deleted['label']!.v).toBe('secret');
  });

  it('md5Hex hashes text to lower-case hex', () => {
    expect(md5Hex('hello world')).toBe('5eb63bbbe01eeed093cb22bb8f5acdc3');
  });
});
