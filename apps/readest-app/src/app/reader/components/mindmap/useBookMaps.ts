import { useEffect, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { mindmapFsFromAppService } from '@/services/mindmap/persist/mindmapFs';
import {
  type MindmapIndexEntry,
  listenMindmapIndex,
  loadMindmapIndex,
} from '@/services/mindmap/persist/mindmapIndex';
import { deleteMindmap } from '@/services/mindmap/sync/deleteMap';
import { useMindmapViewStore } from '@/store/mindmapViewStore';
import { eventDispatcher } from '@/utils/event';

export const useMapList = (bookHash: string): MindmapIndexEntry[] => {
  const { appService } = useEnv();
  const [maps, setMaps] = useState<MindmapIndexEntry[]>([]);
  useEffect(() => {
    if (!appService) return;
    let current = true;
    const unlisten = listenMindmapIndex(bookHash, setMaps);
    loadMindmapIndex(mindmapFsFromAppService(appService), bookHash)
      .then((entries) => {
        if (current) setMaps(entries);
      })
      .catch((error: unknown) => console.error('mindmap: failed to list maps', error));
    return () => {
      current = false;
      unlisten();
    };
  }, [appService, bookHash]);
  return maps;
};

export const useDeleteMap = (
  bookKey: string,
  bookHash: string,
  mapId: string,
  maps: MindmapIndexEntry[],
): (() => Promise<void>) => {
  const _ = useTranslation();
  const { showMap, close } = useMindmapViewStore();
  return async () => {
    try {
      await deleteMindmap(mapId, bookHash);
      const next = maps.find((entry) => entry.mapId !== mapId);
      if (next) showMap(bookKey, next.mapId);
      else close();
    } catch (error) {
      console.error('mindmap: failed to delete the map', error);
      eventDispatcher.dispatch('toast', {
        type: 'error',
        message: _('Could not delete the mind map'),
      });
    }
  };
};
