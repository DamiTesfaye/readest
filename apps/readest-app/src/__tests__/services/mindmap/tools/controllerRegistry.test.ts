import { describe, expect, it } from 'vitest';
import { createMapStore } from '@/services/mindmap/store/mapStore';
import { createCanvasController } from '@/services/mindmap/tools/controller';
import {
  getOpenCanvasController,
  registerCanvasController,
} from '@/services/mindmap/tools/controllerRegistry';

const controller = () =>
  createCanvasController({ store: createMapStore([]), camera: { x: 0, y: 0, z: 1 } });

describe('controller registry', () => {
  it('finds the controller of an open map until it unregisters', () => {
    const first = controller();
    const unregister = registerCanvasController('m1', first);
    expect(getOpenCanvasController('m1')).toBe(first);
    unregister();
    expect(getOpenCanvasController('m1')).toBeUndefined();
  });

  it('keeps a newer controller when an older one unregisters late', () => {
    const older = controller();
    const newer = controller();
    const unregisterOlder = registerCanvasController('m1', older);
    const unregisterNewer = registerCanvasController('m1', newer);
    unregisterOlder();
    expect(getOpenCanvasController('m1')).toBe(newer);
    unregisterNewer();
    expect(getOpenCanvasController('m1')).toBeUndefined();
  });
});
