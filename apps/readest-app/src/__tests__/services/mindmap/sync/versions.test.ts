import { afterEach, describe, expect, test } from 'vitest';
import {
  __resetMindmapManifestsForTests,
  forgetStaleMindmapVersions,
  incomingDir,
  isStaleMindmapVersion,
  latestMindmapManifest,
  markMindmapVersionKnown,
  noteMindmapManifest,
  outgoingDir,
  parseVersionFilename,
  unmergedMindmapVersion,
  versionFilename,
} from '@/services/mindmap/sync/versions';

const MD5 = '0123456789abcdef0123456789abcdef';

afterEach(() => {
  __resetMindmapManifestsForTests();
});

describe('mindmap version names', () => {
  test('name a version by its map and the md5 of its bytes, and parse back', () => {
    expect(versionFilename('map1', MD5)).toBe(`map1.${MD5}.json`);
    expect(parseVersionFilename(`map1.${MD5}.json`)).toEqual({ mapId: 'map1', md5: MD5 });
  });

  test.each([
    'map1.json',
    `map1.${MD5}.json.bak`,
    `../map1.${MD5}.json`,
    `map1.${MD5.toUpperCase()}.json`,
    `.${MD5}.json`,
  ])('reject %s', (filename) => {
    expect(parseVersionFilename(filename)).toBeNull();
  });

  test('keep incoming and outgoing copies inside the map directory', () => {
    expect(incomingDir('book1/mindmaps/map1')).toBe('book1/mindmaps/map1/incoming');
    expect(outgoingDir('book1/mindmaps/map1')).toBe('book1/mindmaps/map1/outgoing');
  });

  test('remember the newest manifest file seen for each map', () => {
    const file = { filename: `map1.${MD5}.json`, byteSize: 9, partialMd5: 'x' };
    expect(latestMindmapManifest('map1')).toBeUndefined();
    noteMindmapManifest('map1', file);
    expect(latestMindmapManifest('map1')).toEqual(file);
  });

  test('name the seen version as unmerged until it is synced or known', () => {
    const file = { filename: `map1.${MD5}.json`, byteSize: 9, partialMd5: 'x' };
    expect(unmergedMindmapVersion('map1', null)).toBeUndefined();
    noteMindmapManifest('map1', file);
    expect(unmergedMindmapVersion('map1', null)).toEqual(file);
    expect(unmergedMindmapVersion('map1', MD5)).toBeUndefined();
    markMindmapVersionKnown(file.filename);
    expect(unmergedMindmapVersion('map1', null)).toBeUndefined();
  });

  test('forget a seen version whose download was stale, but not a newer one', () => {
    const stale = { filename: `map1.${MD5}.json`, byteSize: 9, partialMd5: 'x' };
    const newer = { filename: `map1.${'f'.repeat(32)}.json`, byteSize: 9, partialMd5: 'y' };
    noteMindmapManifest('map1', newer);
    forgetStaleMindmapVersions('map1', [stale.filename]);
    expect(latestMindmapManifest('map1')).toEqual(newer);
    noteMindmapManifest('map1', stale);
    forgetStaleMindmapVersions('map1', [stale.filename]);
    expect(latestMindmapManifest('map1')).toBeUndefined();
    expect(isStaleMindmapVersion(stale.filename)).toBe(true);
    expect(isStaleMindmapVersion(newer.filename)).toBe(false);
  });
});
