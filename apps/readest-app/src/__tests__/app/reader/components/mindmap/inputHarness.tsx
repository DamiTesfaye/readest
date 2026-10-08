import { render } from '@testing-library/react';
import { useRef } from 'react';
import { type Mock, vi } from 'vitest';
import { useCanvasInput } from '@/app/reader/components/mindmap/useCanvasInput';
import { useMindmapShortcuts } from '@/app/reader/components/mindmap/useMindmapShortcuts';
import type { MapRecord } from '@/services/mindmap/schema/types';
import { createMapStore } from '@/services/mindmap/store/mapStore';
import { type CanvasController, createCanvasController } from '@/services/mindmap/tools/controller';

HTMLElement.prototype.setPointerCapture = vi.fn();
HTMLElement.prototype.releasePointerCapture = vi.fn();
HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);

interface HarnessProps {
  controller: CanvasController;
  wheelZooms: boolean;
  focusRecord: (id: string) => void;
}

const Harness = ({ controller, wheelZooms, focusRecord }: HarnessProps) => {
  const ref = useRef<HTMLDivElement>(null);
  useCanvasInput(ref, controller, wheelZooms);
  useMindmapShortcuts(ref, controller, focusRecord, false);
  return (
    <div ref={ref} data-testid='root' tabIndex={0}>
      <div className='nodrag nowheel' data-testid='chrome' />
      <button type='button' data-testid='handle' data-connect-handle='right' data-record-id='a' />
      <textarea data-testid='typing' />
    </div>
  );
};

export interface InputHarness {
  controller: CanvasController;
  focusRecord: Mock<(id: string) => void>;
  rerender(wheelZooms: boolean): void;
}

export const renderInput = (records: MapRecord[] = [], wheelZooms = false): InputHarness => {
  let next = 0;
  const controller = createCanvasController({
    store: createMapStore(records),
    camera: { x: 0, y: 0, z: 1 },
    createId: () => {
      next += 1;
      return `new${next}`;
    },
  });
  controller.viewport.set({ width: 800, height: 600 });
  const focusRecord = vi.fn<(id: string) => void>();
  const view = render(
    <Harness controller={controller} wheelZooms={wheelZooms} focusRecord={focusRecord} />,
  );
  return {
    controller,
    focusRecord,
    rerender: (zooms) =>
      view.rerender(
        <Harness controller={controller} wheelZooms={zooms} focusRecord={focusRecord} />,
      ),
  };
};
