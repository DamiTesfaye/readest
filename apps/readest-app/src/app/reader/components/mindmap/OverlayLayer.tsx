import clsx from 'clsx';
import React from 'react';
import { MdAdd } from 'react-icons/md';
import { useTranslation } from '@/hooks/useTranslation';
import type { BoundsRect, Point } from '@/services/mindmap/records/geometry';
import { linkShape } from '@/services/mindmap/records/linkGeometry';
import type { LinkAnchor, LinkRecord, MapCamera, MapRecord } from '@/services/mindmap/schema/types';
import { isLive, liveLinkEnds, recordBounds } from '@/services/mindmap/spatial/spatialIndex';
import type { MapStore } from '@/services/mindmap/store/mapStore';
import type { CanvasController } from '@/services/mindmap/tools/controller';
import { editableText, livePositioned } from '@/services/mindmap/tools/records';
import { CONNECT_HANDLE_OFFSET_PX } from '@/services/mindmap/tools/types';
import LabelEditor from './LabelEditor';
import { useAtomValue, useMapRecords } from './useCanvasStores';

const LINK_EDITOR_SIZE = { w: 120, h: 32 };

const toScreen = (box: BoundsRect, camera: MapCamera): BoundsRect => ({
  x: box.x * camera.z + camera.x,
  y: box.y * camera.z + camera.y,
  w: box.w * camera.z,
  h: box.h * camera.z,
});

const handlePoints = (box: BoundsRect): Array<[LinkAnchor['side'], Point]> => [
  ['top', { x: box.x + box.w / 2, y: box.y - CONNECT_HANDLE_OFFSET_PX }],
  ['right', { x: box.x + box.w + CONNECT_HANDLE_OFFSET_PX, y: box.y + box.h / 2 }],
  ['bottom', { x: box.x + box.w / 2, y: box.y + box.h + CONNECT_HANDLE_OFFSET_PX }],
  ['left', { x: box.x - CONNECT_HANDLE_OFFSET_PX, y: box.y + box.h / 2 }],
];

const linkPath = (link: LinkRecord, store: MapStore): string | null => {
  const ends = liveLinkEnds(link, store.get);
  return ends ? linkShape(recordBounds(ends[0]), recordBounds(ends[1]), link).d : null;
};

const editorBounds = (record: MapRecord, store: MapStore): BoundsRect | null => {
  if (record.type !== 'link') return recordBounds(record);
  const ends = liveLinkEnds(record, store.get);
  if (!ends) return null;
  const { mid } = linkShape(recordBounds(ends[0]), recordBounds(ends[1]), record);
  return {
    x: mid.x - LINK_EDITOR_SIZE.w / 2,
    y: mid.y - LINK_EDITOR_SIZE.h / 2,
    ...LINK_EDITOR_SIZE,
  };
};

interface OverlayLayerProps {
  controller: CanvasController;
  eink: boolean;
}

const OverlayLayer: React.FC<OverlayLayerProps> = ({ controller, eink }) => {
  const _ = useTranslation();
  useMapRecords(controller.store);
  const camera = useAtomValue(controller.camera);
  const selection = useAtomValue(controller.selection);
  const hover = useAtomValue(controller.hover);
  const editing = useAtomValue(controller.editing);
  const { brush, guides } = useAtomValue(controller.live);
  const { store, readOnly } = controller;

  const selected = livePositioned(store, selection);
  const selectedLinks = selection
    .map((id) => store.get(id))
    .filter((record): record is LinkRecord => isLive(record) && record.type === 'link');
  const single = selected.length === 1 && selectedLinks.length === 0 ? selected[0]! : null;
  const hovered = !eink && hover ? livePositioned(store, [hover])[0] : undefined;
  const handleOwner =
    readOnly || editing !== null
      ? undefined
      : [single, hovered].find((record) => record?.type === 'node');
  const resizeBox =
    single && single.type !== 'ink' && !readOnly && editing === null
      ? toScreen(recordBounds(single), camera)
      : null;
  const editingRecord = editing ? store.get(editing) : undefined;
  const editorBox =
    editingRecord && isLive(editingRecord) ? editorBounds(editingRecord, store) : null;

  return (
    <div data-testid='mm-overlay' className='pointer-events-none absolute inset-0 overflow-hidden'>
      <svg className='absolute inset-0 h-full w-full overflow-visible' aria-hidden='true'>
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.z})`}>
          {selectedLinks.map((link) => (
            <path
              key={link.id}
              data-testid='mm-link-selection'
              d={linkPath(link, store) ?? ''}
              fill='none'
              stroke='var(--mm-select)'
              strokeWidth={3}
              vectorEffect='non-scaling-stroke'
            />
          ))}
          {guides.map((guide) => (
            <line
              key={`${guide.x1},${guide.y1},${guide.x2},${guide.y2}`}
              data-testid='mm-snap-guide'
              {...guide}
              stroke='var(--mm-select)'
              strokeWidth={1}
              vectorEffect='non-scaling-stroke'
            />
          ))}
        </g>
      </svg>
      {selected.map((record) => {
        const box = toScreen(recordBounds(record), camera);
        return (
          <div
            key={record.id}
            data-testid='mm-selection-ring'
            className='absolute rounded-md border-2'
            style={{
              left: box.x - 3,
              top: box.y - 3,
              width: box.w + 6,
              height: box.h + 6,
              borderColor: 'var(--mm-select)',
            }}
          />
        );
      })}
      {handleOwner &&
        handlePoints(toScreen(recordBounds(handleOwner), camera)).map(([side, at]) => (
          <button
            key={side}
            type='button'
            tabIndex={-1}
            data-connect-handle={side}
            data-record-id={handleOwner.id}
            aria-label={_('Connect')}
            className='pointer-events-auto absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full [@media(pointer:coarse)]:size-11'
            style={{ left: at.x, top: at.y }}
          >
            <span
              className={clsx(
                'flex size-4 items-center justify-center rounded-full',
                eink && 'border',
              )}
              style={{
                background: eink ? '#ffffff' : 'var(--mm-select)',
                color: eink ? '#000000' : '#ffffff',
              }}
            >
              <MdAdd size={12} />
            </span>
          </button>
        ))}
      {single && resizeBox && (
        <button
          type='button'
          tabIndex={-1}
          data-resize-handle
          data-record-id={single.id}
          aria-label={_('Resize')}
          className='pointer-events-auto absolute flex size-5 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize items-center justify-center [@media(pointer:coarse)]:size-10'
          style={{ left: resizeBox.x + resizeBox.w, top: resizeBox.y + resizeBox.h }}
        >
          <span
            className='bg-base-100 size-2.5 rounded-sm border-2'
            style={{ borderColor: 'var(--mm-select)' }}
          />
        </button>
      )}
      {brush && (
        <div
          data-testid='mm-brush'
          className='absolute border'
          style={{
            left: toScreen(brush, camera).x,
            top: toScreen(brush, camera).y,
            width: toScreen(brush, camera).w,
            height: toScreen(brush, camera).h,
            borderColor: 'var(--mm-select)',
            background: 'color-mix(in srgb, var(--mm-select) 10%, transparent)',
          }}
        />
      )}
      {editingRecord && editorBox && (
        <LabelEditor
          key={editingRecord.id}
          controller={controller}
          id={editingRecord.id}
          initial={editableText(editingRecord)}
          rect={toScreen(editorBox, camera)}
        />
      )}
    </div>
  );
};

export default OverlayLayer;
