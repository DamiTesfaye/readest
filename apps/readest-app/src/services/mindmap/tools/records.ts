import { keyBetween } from '@/services/mindmap/order/keyBetween';
import type { BoundsRect, Point } from '@/services/mindmap/records/geometry';
import {
  type NewPositionedInput,
  createNodeRecord,
  createSectionRecord,
  createShapeRecord,
  createStickyRecord,
  createTextRecord,
} from '@/services/mindmap/records/defaults';
import type { MapRecord, PositionedRecord, SectionRecord } from '@/services/mindmap/schema/types';
import { snapToGrid } from '@/services/mindmap/snap/snap';
import { isLive, isPositioned } from '@/services/mindmap/spatial/spatialIndex';
import { type MapStore, readField } from '@/services/mindmap/store/mapStore';
import type { PlaceToolId } from '@/services/mindmap/tools/types';

export type EditableField = 'label' | 'text' | 'title';

export const editableField = (record: MapRecord): EditableField | null => {
  if (record.type === 'node' || record.type === 'link') return 'label';
  if (record.type === 'sticky' || record.type === 'text') return 'text';
  if (record.type === 'section') return 'title';
  return null;
};

export const editableText = (record: MapRecord): string => {
  const field = editableField(record);
  if (!field) return '';
  const value = readField(record, field);
  return typeof value === 'string' ? value : '';
};

export const topIndex = (store: MapStore): string => {
  let max: string | null = null;
  for (const record of store.all()) if (max === null || record.index > max) max = record.index;
  return keyBetween(max, null);
};

export const bottomIndex = (store: MapStore): string => {
  let min: string | null = null;
  for (const record of store.all()) if (min === null || record.index < min) min = record.index;
  return keyBetween(null, min);
};

export const createRecordForTool = (
  tool: PlaceToolId,
  input: NewPositionedInput,
): PositionedRecord => {
  if (tool === 'node') return createNodeRecord(input);
  if (tool === 'sticky') return createStickyRecord(input);
  if (tool === 'text') return createTextRecord(input);
  if (tool === 'section') return createSectionRecord(input);
  return createShapeRecord({ ...input, geo: tool === 'ellipse' ? 'ellipse' : 'rect' });
};

export const centeredOn = <R extends PositionedRecord>(record: R, point: Point): R => ({
  ...record,
  x: snapToGrid(point.x - record.w / 2),
  y: snapToGrid(point.y - record.h / 2),
});

export const sectionAt = (
  store: MapStore,
  point: Point,
  excluded: ReadonlySet<string> = new Set(),
): string | null => {
  const sections = store
    .all()
    .filter(
      (record): record is SectionRecord =>
        isLive(record) &&
        record.type === 'section' &&
        !excluded.has(record.id) &&
        point.x >= record.x &&
        point.x <= record.x + record.w &&
        point.y >= record.y &&
        point.y <= record.y + record.h,
    )
    .sort((a, b) => (a.index < b.index ? -1 : 1));
  return sections[sections.length - 1]?.id ?? null;
};

export const boxCenter = (box: BoundsRect): Point => ({
  x: box.x + box.w / 2,
  y: box.y + box.h / 2,
});

export const livePositioned = (store: MapStore, ids: readonly string[]): PositionedRecord[] =>
  ids
    .map((id) => store.get(id))
    .filter((record): record is PositionedRecord => isLive(record) && isPositioned(record));

export const unionBounds = (boxes: BoundsRect[]): BoundsRect | null => {
  if (boxes.length === 0) return null;
  const minX = Math.min(...boxes.map((b) => b.x));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxX = Math.max(...boxes.map((b) => b.x + b.w));
  const maxY = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};
