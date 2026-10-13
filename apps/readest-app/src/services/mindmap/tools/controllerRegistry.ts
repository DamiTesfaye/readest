import type { CanvasController } from '@/services/mindmap/tools/controller';

const openControllers = new Map<string, CanvasController>();

export const getOpenCanvasController = (mapId: string): CanvasController | undefined =>
  openControllers.get(mapId);

export const registerCanvasController = (
  mapId: string,
  controller: CanvasController,
): (() => void) => {
  openControllers.set(mapId, controller);
  return () => {
    if (openControllers.get(mapId) === controller) openControllers.delete(mapId);
  };
};
