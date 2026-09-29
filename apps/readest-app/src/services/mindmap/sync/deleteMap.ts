import { useMindmapStore } from '@/services/mindmap/persist/mindmapStore';
import { MINDMAP_KIND } from '@/services/sync/adapters/mindmap';
import { publishReplicaDelete } from '@/services/sync/replicaPublish';

export const deleteMindmap = async (mapId: string, bookHash: string): Promise<void> => {
  await useMindmapStore.getState().moveToTrash(mapId, bookHash, { tombstone: true });
  await publishReplicaDelete(MINDMAP_KIND, mapId);
};

export const deleteMindmapLocally = (mapId: string, bookHash: string): Promise<void> =>
  useMindmapStore.getState().moveToTrash(mapId, bookHash, { tombstone: false });
