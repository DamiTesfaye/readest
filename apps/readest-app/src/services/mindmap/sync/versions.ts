import type { ManifestFile } from '@/types/replica';

export interface MapVersion {
  mapId: string;
  md5: string;
}

const VERSION_FILENAME = /^([0-9A-Za-z_-]{1,64})\.([0-9a-f]{32})\.json$/;

const latestManifests = new Map<string, ManifestFile>();

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

export const __resetMindmapManifestsForTests = (): void => {
  latestManifests.clear();
};
