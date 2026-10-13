import type { FieldsObject } from '@/types/replica';

export type RecordType = 'node' | 'link' | 'section' | 'sticky' | 'text' | 'shape' | 'ink';

export type PresetColor = 'terracotta' | 'plum' | 'sky' | 'mustard' | 'olive' | 'ink' | 'paper';

export type NodeKind = 'character' | 'place' | 'chapter' | 'theme' | 'quote' | 'idea';

export type LinkPathStyle = 'bezier' | 'straight' | 'step';

export interface LinkAnchor {
  side: 'top' | 'right' | 'bottom' | 'left' | 'center';
  t: number;
}

export type ShapeGeo = 'rect' | 'ellipse' | 'diamond';
export type ShapeFill = 'none' | 'tint';

export interface RecordAnchor {
  cfi: string;
  section: number;
  progress: number;
}

export interface Tombstone {
  by: 'user' | 'gen';
}

export interface BaseRecord {
  id: string;
  type: RecordType;
  version: number;
  parentId: string | null;
  index: string;
  origin: 'generated' | 'user';
  genKey: string | null;
  touched: string[];
  anchor: RecordAnchor | null;
  revealAt: number | null;
  deleted: Tombstone | null;
}

export interface PositionedFields {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NodeRecord extends BaseRecord, PositionedFields {
  type: 'node';
  label: string;
  kind: NodeKind;
  color: PresetColor;
  icon: string;
}

export interface LinkRecord extends BaseRecord {
  type: 'link';
  fromId: string;
  toId: string;
  fromAnchor: LinkAnchor | null;
  toAnchor: LinkAnchor | null;
  label: string;
  path: LinkPathStyle;
  dash: boolean;
}

export interface SectionRecord extends BaseRecord, PositionedFields {
  type: 'section';
  title: string;
  color: PresetColor;
}

export interface StickyRecord extends BaseRecord, PositionedFields {
  type: 'sticky';
  text: string;
  color: PresetColor;
}

export interface TextRecord extends BaseRecord, PositionedFields {
  type: 'text';
  text: string;
  size: number;
}

export interface ShapeRecord extends BaseRecord, PositionedFields {
  type: 'shape';
  geo: ShapeGeo;
  color: PresetColor;
  fill: ShapeFill;
}

export interface InkRecord extends BaseRecord, PositionedFields {
  type: 'ink';
  points: string;
  color: PresetColor;
  size: number;
  pen: boolean;
}

export type MapRecord =
  | NodeRecord
  | LinkRecord
  | SectionRecord
  | StickyRecord
  | TextRecord
  | ShapeRecord
  | InkRecord;

export type PositionedRecord = Exclude<MapRecord, LinkRecord>;

export type MapIntent = 'adaptive' | 'study' | 'story' | 'personal';
export type MapSpoiler = 'adaptive' | 'grow' | 'fogged' | 'whole';
export type MapStyle = 'sticker' | 'paper' | 'ink';
export type MapSource = 'generated' | 'blank';

export interface MapCamera {
  x: number;
  y: number;
  z: number;
}

export interface MapMeta {
  title: string;
  intent: MapIntent;
  spoiler: MapSpoiler;
  style: MapStyle;
  camera: MapCamera;
  lastSeenProgress: number;
  source: MapSource;
}

export interface MapFile {
  schemaVersion: number;
  mapId: string;
  meta: FieldsObject;
  records: Record<string, FieldsObject>;
}

export const CURRENT_SCHEMA_VERSION = 1;

export const DEFAULT_MAP_META: MapMeta = {
  title: '',
  intent: 'adaptive',
  spoiler: 'adaptive',
  style: 'sticker',
  camera: { x: 0, y: 0, z: 1 },
  lastSeenProgress: 0,
  source: 'blank',
};

export const CONTENT_FIELDS: Readonly<Record<RecordType, readonly string[]>> = {
  node: ['label'],
  link: ['fromId', 'toId', 'label'],
  section: ['title'],
  sticky: ['text'],
  text: ['text'],
  shape: [],
  ink: ['points'],
};

export const isRecordType = (value: unknown): value is RecordType =>
  typeof value === 'string' && Object.hasOwn(CONTENT_FIELDS, value);
