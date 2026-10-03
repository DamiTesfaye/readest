import { useMemo } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { EXTS } from '@/libs/document';
import { exportJsonCanvas } from '@/services/mindmap/export/jsonCanvas';
import { resetPlacement } from '@/services/mindmap/layout/layout';
import { getOpenMapSession } from '@/services/mindmap/persist/session';
import { getOpenCanvasController } from '@/services/mindmap/tools/controllerRegistry';
import { useBookDataStore } from '@/store/bookDataStore';
import { useMindmapViewStore } from '@/store/mindmapViewStore';
import { eventDispatcher } from '@/utils/event';
import { makeSafeFilename } from '@/utils/misc';

export interface MindmapActions {
  onExport: (mapId: string) => void;
  onResetPosition: (mapId: string, recordId: string) => void;
}

export const resetRecordPosition = (mapId: string, recordId: string): void => {
  const controller = getOpenCanvasController(mapId);
  if (!controller) return;
  const point = resetPlacement(controller.store, controller.spatial, recordId);
  if (!point) return;
  controller.resetPosition(recordId, point);
  controller.ensureVisible(recordId);
};

export const useMindmapActions = (): MindmapActions => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const bookKey = useMindmapViewStore((state) => state.bookKey);

  return useMemo(() => {
    const exportMap = async (mapId: string): Promise<void> => {
      const session = getOpenMapSession(mapId);
      if (!session || !appService) return;
      const controller = getOpenCanvasController(mapId);
      if (!controller) return;
      const book = bookKey ? useBookDataStore.getState().getBookData(bookKey)?.book : null;
      const bookFile = book
        ? `${makeSafeFilename(book.sourceTitle || book.title)}.${EXTS[book.format]}`
        : '';
      const canvas = exportJsonCanvas(session.store.all(), {
        bookFile,
        include: (record) => controller.isShown(record.id),
      });
      const title = session.meta().title || _('Untitled map');
      const saved = await appService.saveFile(
        `${makeSafeFilename(title)}.canvas`,
        JSON.stringify(canvas, null, 2),
        { mimeType: 'application/json' },
      );
      if (saved) {
        eventDispatcher.dispatch('toast', { type: 'info', message: _('Exported successfully') });
      }
    };
    return {
      onExport: (mapId) => {
        exportMap(mapId).catch((error: unknown) => {
          console.error('mindmap: export failed', error);
          eventDispatcher.dispatch('toast', {
            type: 'error',
            message: _('Could not export the mind map'),
          });
        });
      },
      onResetPosition: resetRecordPosition,
    };
  }, [_, appService, bookKey]);
};
