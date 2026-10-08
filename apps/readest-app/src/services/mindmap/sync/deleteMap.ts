import { useMindmapStore } from '@/services/mindmap/persist/mindmapStore';
import { MINDMAP_KIND } from '@/services/sync/adapters/mindmap';
import { publishReplicaDelete } from '@/services/sync/replicaPublish';
import { transferManager } from '@/services/transferManager';
import { useTransferStore } from '@/store/transferStore';

const TRANSFER_TYPES = ['upload', 'download'] as const;

export const cancelMindmapTransfers = (mapId: string): void => {
  for (const type of TRANSFER_TYPES) {
    const transfer = useTransferStore.getState().getReplicaTransfer(MINDMAP_KIND, mapId, type);
    if (transfer) transferManager.cancelTransfer(transfer.id);
  }
};

export const deleteMindmap = async (mapId: string, bookHash: string): Promise<void> => {
  await useMindmapStore.getState().moveToTrash(mapId, bookHash, { tombstone: true });
  cancelMindmapTransfers(mapId);
  await publishReplicaDelete(MINDMAP_KIND, mapId);
};

export const deleteMindmapLocally = async (mapId: string, bookHash: string): Promise<void> => {
  await useMindmapStore.getState().moveToTrash(mapId, bookHash, { tombstone: false });
  cancelMindmapTransfers(mapId);
};
