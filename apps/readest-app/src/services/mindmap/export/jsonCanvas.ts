import { compareByIndex } from '@/services/mindmap/order/keyBetween';
import type {
  LinkAnchor,
  LinkRecord,
  MapRecord,
  PositionedRecord,
  PresetColor,
} from '@/services/mindmap/schema/types';
import { isLive, isPositioned } from '@/services/mindmap/spatial/spatialIndex';

export type CanvasColor = '1' | '2' | '3' | '4' | '5' | '6';
export type CanvasSide = 'top' | 'right' | 'bottom' | 'left';

export interface CanvasNode {
  id: string;
  type: 'text' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  label?: string;
  color?: CanvasColor;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: CanvasSide;
  toNode: string;
  toSide?: CanvasSide;
  label?: string;
}

export interface JsonCanvas {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

export interface JsonCanvasOptions {
  bookFile: string;
  include?: (record: MapRecord) => boolean;
}

const CANVAS_COLORS: Readonly<Record<PresetColor, CanvasColor | null>> = {
  terracotta: '1',
  mustard: '3',
  olive: '4',
  sky: '5',
  plum: '6',
  ink: null,
  paper: null,
};

const textOf = (record: PositionedRecord): string => {
  if (record.type === 'node') return record.label;
  if (record.type === 'sticky' || record.type === 'text') return record.text;
  return '';
};

const toCanvasNode = (record: PositionedRecord, bookFile: string): CanvasNode => {
  const box = {
    id: record.id,
    x: Math.round(record.x),
    y: Math.round(record.y),
    width: Math.round(record.w),
    height: Math.round(record.h),
  };
  const color = 'color' in record ? CANVAS_COLORS[record.color] : null;
  const colored = color ? { color } : {};
  if (record.type === 'section') return { ...box, type: 'group', label: record.title, ...colored };
  const text = record.anchor
    ? `${textOf(record)}\n\n[${bookFile}](<${bookFile}#${record.anchor.cfi}>)`
    : textOf(record);
  return { ...box, type: 'text', text, ...colored };
};

const sideOf = (anchor: LinkAnchor | null): CanvasSide | null =>
  anchor && anchor.side !== 'center' ? anchor.side : null;

const toCanvasEdge = (link: LinkRecord): CanvasEdge => {
  const fromSide = sideOf(link.fromAnchor);
  const toSide = sideOf(link.toAnchor);
  return {
    id: link.id,
    fromNode: link.fromId,
    ...(fromSide ? { fromSide } : {}),
    toNode: link.toId,
    ...(toSide ? { toSide } : {}),
    ...(link.label ? { label: link.label } : {}),
  };
};

export const exportJsonCanvas = (
  records: readonly MapRecord[],
  { bookFile, include = () => true }: JsonCanvasOptions,
): JsonCanvas => {
  const kept = records.filter((record) => isLive(record) && include(record)).sort(compareByIndex);
  const nodes = kept
    .filter((record): record is PositionedRecord => isPositioned(record) && record.type !== 'ink')
    .map((record) => toCanvasNode(record, bookFile));
  const exported = new Set(nodes.map((node) => node.id));
  const edges = kept
    .filter(
      (record): record is LinkRecord =>
        record.type === 'link' && exported.has(record.fromId) && exported.has(record.toId),
    )
    .map(toCanvasEdge);
  return { nodes, edges };
};
