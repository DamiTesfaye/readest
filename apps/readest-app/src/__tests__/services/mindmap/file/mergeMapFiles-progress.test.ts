import { describe, expect, it } from 'vitest';
import { canonicalStringify } from '@/services/mindmap/file/canonicalStringify';
import { mergeMapFiles } from '@/services/mindmap/file/mergeMapFiles';
import type { MapFile } from '@/services/mindmap/schema/types';
import type { FieldEnvelope, Hlc } from '@/types/replica';

const envelope = (v: unknown, ms: number, device: string): FieldEnvelope => ({
  v,
  t: `${ms.toString(16).padStart(13, '0')}-00000000-${device}` as Hlc,
  s: device,
});

const fileWith = (meta: MapFile['meta']): MapFile => ({
  schemaVersion: 1,
  mapId: 'm1',
  meta,
  records: {},
});

describe('mergeMapFiles lastSeenProgress', () => {
  const ahead = fileWith({
    lastSeenProgress: envelope(0.5, 1, 'd1'),
    title: envelope('Old title', 1, 'd1'),
  });
  const behind = fileWith({
    lastSeenProgress: envelope(0.2, 9, 'd2'),
    title: envelope('New title', 9, 'd2'),
  });

  it('keeps the furthest progress even when the other device wrote later', () => {
    const merged = mergeMapFiles(ahead, behind);
    expect(merged.meta['lastSeenProgress']!.v).toBe(0.5);
    expect(merged.meta['title']!.v).toBe('New title');
  });

  it('gives the same bytes in either order', () => {
    expect(canonicalStringify(mergeMapFiles(ahead, behind))).toBe(
      canonicalStringify(mergeMapFiles(behind, ahead)),
    );
  });

  it('falls back to the newest write when the progress is equal or one side has none', () => {
    const same = fileWith({ lastSeenProgress: envelope(0.5, 9, 'd2') });
    expect(mergeMapFiles(ahead, same).meta['lastSeenProgress']).toEqual(envelope(0.5, 9, 'd2'));
    expect(mergeMapFiles(fileWith({}), behind).meta['lastSeenProgress']!.v).toBe(0.2);
  });
});
