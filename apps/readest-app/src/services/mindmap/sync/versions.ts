import type { ManifestFile } from '@/types/replica';

export interface MapVersion {
  mapId: string;
  md5: string;
}

const VERSION_FILENAME = /^([0-9A-Za-z_-]{1,64})\.([0-9a-f]{32})\.json$/;

const latestManifests = new Map<string, ManifestFile>();
const knownVersions = new Set<string>();
const staleVersions = new Set<string>();

export const versionFilename = (mapId: string, md5: string): string => `${mapId}.${md5}.json`;

export const parseVersionFilename = (filename: string): MapVersion | null => {
  const match = VERSION_FILENAME.exec(filename);
  return match ? { mapId: match[1]!, md5: match[2]! } : null;
};

export const incomingDir = (bundleDir: string): string => `${bundleDir}/incoming`;

export const outgoingDir = (bundleDir: string): string => `${bundleDir}/outgoing`;

export const noteMindmapManifest = (mapId: string, file: ManifestFile): void => {
  latestManifests.set(mapId, file);
};

export const latestMindmapManifest = (mapId: string): ManifestFile | undefined =>
  latestManifests.get(mapId);

export const markMindmapVersionKnown = (filename: string): void => {
  knownVersions.add(filename);
};

export const unmergedMindmapVersion = (
  mapId: string,
  syncedMd5: string | null,
): ManifestFile | undefined => {
  const latest = latestManifests.get(mapId);
  if (!latest || knownVersions.has(latest.filename)) return undefined;
  if (syncedMd5 && latest.filename === versionFilename(mapId, syncedMd5)) return undefined;
  return latest;
};

export const forgetStaleMindmapVersions = (mapId: string, filenames: string[]): void => {
  for (const filename of filenames) staleVersions.add(filename);
  const latest = latestManifests.get(mapId);
  if (latest && filenames.includes(latest.filename)) latestManifests.delete(mapId);
};

export const isStaleMindmapVersion = (filename: string): boolean => staleVersions.has(filename);

export const __resetMindmapManifestsForTests = (): void => {
  latestManifests.clear();
  knownVersions.clear();
  staleVersions.clear();
};
