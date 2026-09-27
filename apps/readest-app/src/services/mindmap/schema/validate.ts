import { z } from 'zod';
import type { FieldsObject } from '@/types/replica';
import { isValidOrderKey } from '@/services/mindmap/order/keyBetween';
import { DEFAULT_MAP_META, type MapMeta, type RecordType } from '@/services/mindmap/schema/types';

const presetColorSchema = z.enum(['terracotta', 'plum', 'sky', 'mustard', 'olive', 'ink', 'paper']);

const linkAnchorSchema = z.object({
  side: z.enum(['top', 'right', 'bottom', 'left', 'center']),
  t: z.number(),
});

const baseFieldsSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  parentId: z.string().nullable(),
  index: z.string().refine(isValidOrderKey),
  origin: z.enum(['generated', 'user']),
  genKey: z.string().nullable(),
  touched: z.array(z.string()),
  anchor: z
    .object({
      cfi: z.string(),
      section: z.number().int().nonnegative(),
      progress: z.number().min(0).max(1),
    })
    .nullable(),
  revealAt: z.number().min(0).max(1).nullable(),
  deleted: z.object({ by: z.enum(['user', 'gen']) }).nullable(),
});

const positionedShape = {
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative(),
  h: z.number().nonnegative(),
};

const RECORD_SCHEMAS: Record<RecordType, z.ZodType> = {
  node: baseFieldsSchema.extend({
    ...positionedShape,
    type: z.literal('node'),
    label: z.string(),
    kind: z.enum(['character', 'place', 'chapter', 'theme', 'quote', 'idea']),
    color: presetColorSchema,
    icon: z.string(),
  }),
  link: baseFieldsSchema.extend({
    type: z.literal('link'),
    fromId: z.string(),
    toId: z.string(),
    fromAnchor: linkAnchorSchema.nullable(),
    toAnchor: linkAnchorSchema.nullable(),
    label: z.string(),
    path: z.enum(['bezier', 'straight', 'step']),
    dash: z.boolean(),
  }),
  section: baseFieldsSchema.extend({
    ...positionedShape,
    type: z.literal('section'),
    title: z.string(),
    color: presetColorSchema,
  }),
  sticky: baseFieldsSchema.extend({
    ...positionedShape,
    type: z.literal('sticky'),
    text: z.string(),
    color: presetColorSchema,
  }),
  text: baseFieldsSchema.extend({
    ...positionedShape,
    type: z.literal('text'),
    text: z.string(),
    size: z.number().positive(),
  }),
  shape: baseFieldsSchema.extend({
    ...positionedShape,
    type: z.literal('shape'),
    geo: z.enum(['rect', 'ellipse', 'diamond']),
    color: presetColorSchema,
    fill: z.enum(['none', 'tint']),
  }),
  ink: baseFieldsSchema.extend({
    ...positionedShape,
    type: z.literal('ink'),
    points: z.string(),
    color: presetColorSchema,
    size: z.number().positive(),
    pen: z.boolean(),
  }),
};

export const validateRecordFields = (
  type: RecordType,
  plainFields: Record<string, unknown>,
): boolean => RECORD_SCHEMAS[type].safeParse(plainFields).success;

const META_FIELD_SCHEMAS: { [K in keyof MapMeta]: z.ZodType<MapMeta[K]> } = {
  title: z.string(),
  intent: z.enum(['adaptive', 'study', 'story', 'personal']),
  spoiler: z.enum(['adaptive', 'grow', 'fogged', 'whole']),
  style: z.enum(['sticker', 'paper', 'ink']),
  camera: z.object({ x: z.number(), y: z.number(), z: z.number().positive() }),
  lastSeenProgress: z.number().min(0).max(1),
  source: z.enum(['generated', 'blank']),
};

const decodeMetaField = <K extends keyof MapMeta>(meta: FieldsObject, key: K): MapMeta[K] => {
  const value = Object.hasOwn(meta, key) ? meta[key]!.v : undefined;
  const parsed = META_FIELD_SCHEMAS[key].safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_MAP_META[key];
};

export const decodeMeta = (meta: FieldsObject): MapMeta => ({
  title: decodeMetaField(meta, 'title'),
  intent: decodeMetaField(meta, 'intent'),
  spoiler: decodeMetaField(meta, 'spoiler'),
  style: decodeMetaField(meta, 'style'),
  camera: decodeMetaField(meta, 'camera'),
  lastSeenProgress: decodeMetaField(meta, 'lastSeenProgress'),
  source: decodeMetaField(meta, 'source'),
});
