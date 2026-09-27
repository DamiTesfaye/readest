import type { MindmapFs } from '@/services/mindmap/persist/mindmapFs';
import { moveMapDirToTrash, saveMapFile } from '@/services/mindmap/persist/mapFile';
import {
  removeFromMindmapIndex,
  updateMindmapIndex,
} from '@/services/mindmap/persist/mindmapIndex';
import type { MapFile } from '@/services/mindmap/schema/types';

export const saveMap = async (fs: MindmapFs, bookHash: string, file: MapFile): Promise<string> => {
  const text = await saveMapFile(fs, bookHash, file);
  await updateMindmapIndex(fs, bookHash, file);
  return text;
};

export const trashMap = async (fs: MindmapFs, bookHash: string, mapId: string): Promise<void> => {
  await moveMapDirToTrash(fs, bookHash, mapId);
  await removeFromMindmapIndex(fs, bookHash, mapId);
};
