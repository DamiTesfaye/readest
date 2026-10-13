import { render } from '@testing-library/react';
import { type Mock, vi } from 'vitest';
import MindmapCanvas, {
  type MindmapCanvasProps,
} from '@/app/reader/components/mindmap/MindmapCanvas';
import type { MapCamera, MapRecord, RecordAnchor } from '@/services/mindmap/schema/types';
import { type MapStore, createMapStore } from '@/services/mindmap/store/mapStore';
import { type CanvasController, createCanvasController } from '@/services/mindmap/tools/controller';

HTMLElement.prototype.setPointerCapture = vi.fn();
HTMLElement.prototype.releasePointerCapture = vi.fn();
HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);

export interface CanvasHarness {
  store: MapStore;
  controller: CanvasController;
  onJumpToBook: Mock<(anchor: RecordAnchor) => void>;
  rerender(next: Partial<MindmapCanvasProps>): void;
}

export const renderCanvas = (
  records: MapRecord[],
  props: Partial<Omit<MindmapCanvasProps, 'controller'>> = {},
  camera: MapCamera = { x: 0, y: 0, z: 1 },
): CanvasHarness => {
  const store = createMapStore(records);
  let next = 0;
  const controller = createCanvasController({
    store,
    camera,
    createId: () => {
      next += 1;
      return `new${next}`;
    },
  });
  const onJumpToBook = vi.fn<(anchor: RecordAnchor) => void>();
  const allProps: MindmapCanvasProps = {
    controller,
    title: 'Pride and Prejudice',
    mapStyle: 'sticker',
    mode: 'light',
    animate: true,
    wheelZooms: false,
    autoFocus: false,
    reveal: null,
    announcement: '',
    onJumpToBook,
    ...props,
  };
  const view = render(<MindmapCanvas {...allProps} />);
  return {
    store,
    controller,
    onJumpToBook,
    rerender: (next) => view.rerender(<MindmapCanvas {...allProps} {...next} />),
  };
};
