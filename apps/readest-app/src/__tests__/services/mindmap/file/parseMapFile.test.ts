import { describe, expect, it } from 'vitest';
import { parseMapFile } from '@/services/mindmap/file/parseMapFile';

const T = '0000000000001-00000000-d1';

const text = (value: unknown): string => JSON.stringify(value);

const valid = {
  schemaVersion: 1,
  mapId: 'm1',
  meta: { title: { v: 'Map', t: T, s: 'd1' } },
  records: { n1: { type: { v: 'node', t: T, s: 'd1' } } },
};

describe('parseMapFile', () => {
  it('accepts a well-formed file', () => {
    expect(parseMapFile(text(valid), 'm1')).toEqual(valid);
  });

  it('rejects text that is not a map file object', () => {
    expect(parseMapFile('not json', 'm1')).toBeNull();
    expect(parseMapFile('null', 'm1')).toBeNull();
    expect(parseMapFile('[]', 'm1')).toBeNull();
  });

  it('rejects a file for another map or with a bad schema version', () => {
    expect(parseMapFile(text(valid), 'm2')).toBeNull();
    expect(parseMapFile(text({ ...valid, schemaVersion: -1 }), 'm1')).toBeNull();
    expect(parseMapFile(text({ ...valid, schemaVersion: 1.5 }), 'm1')).toBeNull();
  });

  it('rejects wrongly shaped meta, records and envelopes', () => {
    expect(parseMapFile(text({ ...valid, records: null }), 'm1')).toBeNull();
    expect(parseMapFile(text({ ...valid, meta: [] }), 'm1')).toBeNull();
    expect(parseMapFile(text({ ...valid, records: { n1: { type: null } } }), 'm1')).toBeNull();
    expect(
      parseMapFile(text({ ...valid, records: { n1: { type: { t: T, s: 'd1' } } } }), 'm1'),
    ).toBeNull();
    expect(
      parseMapFile(
        text({ ...valid, records: { n1: { type: { v: 'node', t: 'later', s: 'd1' } } } }),
        'm1',
      ),
    ).toBeNull();
  });

  it('rejects a __proto__ key', () => {
    const raw = `{"schemaVersion":1,"mapId":"m1","meta":{},"records":{"__proto__":{}}}`;
    expect(parseMapFile(raw, 'm1')).toBeNull();
  });
});
