import { useEffect, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { readRawMapText } from '@/services/mindmap/persist/mapFile';
import { mindmapFsFromAppService } from '@/services/mindmap/persist/mindmapFs';
import {
  type MindmapIndexEntry,
  listenMindmapIndex,
  loadMindmapIndex,
} from '@/services/mindmap/persist/mindmapIndex';
import { deleteMindmap, deleteMindmapLocally } from '@/services/mindmap/sync/deleteMap';
import { useMindmapViewStore } from '@/store/mindmapViewStore';
import { eventDispatcher } from '@/utils/event';
import { makeSafeFilename } from '@/utils/misc';

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

export interface DeleteMapOptions {
  localOnly: boolean;
}

export const useDeleteMap = (
  bookKey: string,
  bookHash: string,
  mapId: string,
  maps: MindmapIndexEntry[],
  options: DeleteMapOptions = { localOnly: false },
): (() => Promise<void>) => {
  const _ = useTranslation();
  const { showMap, close } = useMindmapViewStore();
  const remove = options.localOnly ? deleteMindmapLocally : deleteMindmap;
  return async () => {
    try {
      await remove(mapId, bookHash);
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

export const useExportRawMap = (
  bookHash: string,
  mapId: string,
  title: string,
): (() => Promise<void>) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  return async () => {
    try {
      if (!appService) throw new Error('mindmap: no app service');
      const text = await readRawMapText(mindmapFsFromAppService(appService), bookHash, mapId);
      if (text === null) throw new Error('mindmap: the map has no file to export');
      const saved = await appService.saveFile(`${makeSafeFilename(title || mapId)}.json`, text, {
        mimeType: 'application/json',
      });
      if (saved) {
        eventDispatcher.dispatch('toast', { type: 'info', message: _('Exported successfully') });
      }
    } catch (error) {
      console.error('mindmap: failed to export the raw map file', error);
      eventDispatcher.dispatch('toast', {
        type: 'error',
        message: _('Could not export the map file'),
      });
    }
  };
};
