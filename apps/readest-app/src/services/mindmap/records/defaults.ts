import type {
  BaseRecord,
  InkRecord,
  LinkAnchor,
  LinkPathStyle,
  LinkRecord,
  NodeKind,
  NodeRecord,
  PositionedFields,
  PresetColor,
  RecordType,
  SectionRecord,
  ShapeFill,
  ShapeGeo,
  ShapeRecord,
  StickyRecord,
  TextRecord,
} from '@/services/mindmap/schema/types';

export interface NewRecordInput {
  id: string;
  index: string;
  parentId?: string | null;
}

export interface NewPositionedInput extends NewRecordInput {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

const baseFields = <T extends RecordType>(
  input: NewRecordInput,
  type: T,
): BaseRecord & { type: T } => ({
  id: input.id,
  type,
  version: 1,
  parentId: input.parentId ?? null,
  index: input.index,
  origin: 'user',
  genKey: null,
  touched: [],
  anchor: null,
  revealAt: null,
  deleted: null,
});

const positionedFields = (
  input: NewPositionedInput,
  defaultW: number,
  defaultH: number,
): PositionedFields => ({
  x: input.x ?? 0,
  y: input.y ?? 0,
  w: input.w ?? defaultW,
  h: input.h ?? defaultH,
});

export interface NewNodeInput extends NewPositionedInput {
  label?: string;
  kind?: NodeKind;
  color?: PresetColor;
  icon?: string;
}

export const createNodeRecord = (input: NewNodeInput): NodeRecord => ({
  ...baseFields(input, 'node'),
  ...positionedFields(input, 160, 64),
  label: input.label ?? '',
  kind: input.kind ?? 'idea',
  color: input.color ?? 'terracotta',
  icon: input.icon ?? '',
});

export interface NewLinkInput extends NewRecordInput {
  fromId: string;
  toId: string;
  fromAnchor?: LinkAnchor | null;
  toAnchor?: LinkAnchor | null;
  label?: string;
  path?: LinkPathStyle;
  dash?: boolean;
}

export const createLinkRecord = (input: NewLinkInput): LinkRecord => ({
  ...baseFields(input, 'link'),
  fromId: input.fromId,
  toId: input.toId,
  fromAnchor: input.fromAnchor ?? null,
  toAnchor: input.toAnchor ?? null,
  label: input.label ?? '',
  path: input.path ?? 'bezier',
  dash: input.dash ?? false,
});

export interface NewSectionInput extends NewPositionedInput {
  title?: string;
  color?: PresetColor;
}

export const createSectionRecord = (input: NewSectionInput): SectionRecord => ({
  ...baseFields(input, 'section'),
  ...positionedFields(input, 320, 240),
  title: input.title ?? '',
  color: input.color ?? 'sky',
});

export interface NewStickyInput extends NewPositionedInput {
  text?: string;
  color?: PresetColor;
}

export const createStickyRecord = (input: NewStickyInput): StickyRecord => ({
  ...baseFields(input, 'sticky'),
  ...positionedFields(input, 180, 180),
  text: input.text ?? '',
  color: input.color ?? 'mustard',
});

export interface NewTextInput extends NewPositionedInput {
  text?: string;
  size?: number;
}

export const createTextRecord = (input: NewTextInput): TextRecord => ({
  ...baseFields(input, 'text'),
  ...positionedFields(input, 200, 32),
  text: input.text ?? '',
  size: input.size ?? 16,
});

export interface NewShapeInput extends NewPositionedInput {
  geo?: ShapeGeo;
  color?: PresetColor;
  fill?: ShapeFill;
}

export const createShapeRecord = (input: NewShapeInput): ShapeRecord => ({
  ...baseFields(input, 'shape'),
  ...positionedFields(input, 120, 120),
  geo: input.geo ?? 'rect',
  color: input.color ?? 'plum',
  fill: input.fill ?? 'tint',
});

export interface NewInkInput extends NewRecordInput, PositionedFields {
  points: string;
  color?: PresetColor;
  size?: number;
  pen?: boolean;
}

export const createInkRecord = (input: NewInkInput): InkRecord => ({
  ...baseFields(input, 'ink'),
  x: input.x,
  y: input.y,
  w: input.w,
  h: input.h,
  points: input.points,
  color: input.color ?? 'ink',
  size: input.size ?? 4,
  pen: input.pen ?? false,
});
