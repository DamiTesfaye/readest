import { z } from 'zod';
import { type PlayElement, validatePlayElement } from './play/element';
import type { Quote } from './types';

export const PAYLOAD_MAX = 16 * 1024;
export const ELEMENTS_MAX = 8;
export const ARTWORK_MAX = 4;
export const NOTE_MAX = 2000;
export const ALT_MAX = 300;
export const PASSAGE_MAX = 3000;
export const AGGREGATE_MAX = 3000;
export const QUOTE_MAX = 300;
export const TRANSLATION_UNCAPPED_MAX = 6000;

export const KINDS = ['clip', 'note', 'translation', 'artwork', 'sticker', 'play'] as const;

export type Contract = 'overlay' | 'displace' | 'detach';

export type Ground = 'paper' | 'ink' | 'lime';
export type Motion = 'rise' | 'drift' | 'breathe';

export interface Frame {
  x: number;
  y: number;
  w: number;
  r: number;
}

interface ElementBase {
  id: string;
  frame: Frame;
  motion?: Motion | null;
}

export interface NoteElement extends ElementBase {
  kind: 'note';
  text: string;
  hand?: boolean | null;
}

export interface TranslationElement extends ElementBase {
  kind: 'translation';
  mode: 'translation' | 'gloss';
  lang: string;
  text: string;
  source: 'hand' | 'mt';
}

export interface ArtworkElement extends ElementBase {
  kind: 'artwork';
  asset: string;
  alt: string;
  source: 'upload' | 'drawing';
}

export interface StickerElement extends ElementBase {
  kind: 'sticker';
  sticker: string;
}

export interface UnknownElement extends ElementBase {
  kind: string;
  [field: string]: unknown;
}

export type Element =
  | NoteElement
  | TranslationElement
  | ArtworkElement
  | StickerElement
  | UnknownElement;

export type QuoteSize = 's' | 'm' | 'l';
export type QuoteFont = 'serif' | 'sans' | 'mono' | 'hand';

export interface QuoteStyle {
  frame: Frame;
  size: QuoteSize;
  font?: QuoteFont;
  weight?: 'regular' | 'bold';
  italic?: boolean;
}

export interface Envelope {
  v: 1;
  ground: Ground;
  quote: QuoteStyle;
  elements: Element[];
}

export const scalars = (s: string): number => [...s].length;

export const quoteCost = (quote: Quote): number =>
  'exact' in quote ? scalars(quote.exact) : scalars(quote.head) + scalars(quote.tail);

export const translationMax = (quoteCost: number, capped: boolean): number =>
  capped ? Math.min(600, Math.max(200, 2 * quoteCost)) : TRANSLATION_UNCAPPED_MAX;

export const envelopeBytes = (e: Envelope): number =>
  new TextEncoder().encode(JSON.stringify(e)).length;

export const leadKind = (e: Envelope): string => e.elements[0]?.kind ?? 'clip';

export const contractOf = (e: Envelope): Contract => {
  const plays = e.elements.filter((x) => x.kind === 'play');
  return plays.length === 1 ? (plays[0] as unknown as PlayElement).contract : 'overlay';
};

export const emptyEnvelope = (): Envelope => ({
  v: 1,
  ground: 'paper',
  quote: { frame: { x: 0.5, y: 0.5, w: 0.8, r: 0 }, size: 'm' },
  elements: [],
});

const ASSET_ID = /^ast_[0-9a-fA-F]{32}$/;
const LOCAL_ASSET = /^local:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sized = (max: number) => z.string().refine((s) => s.length > 0 && scalars(s) <= max);

const frame = z.strictObject({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0.05).max(1),
  r: z.number().min(-180).max(180),
});

const base = {
  id: z.string().regex(/^[A-Za-z0-9_-]{1,24}$/),
  frame,
  motion: z.enum(['rise', 'drift', 'breathe']).nullish(),
};

const envelope = z.strictObject({
  v: z.literal(1),
  ground: z.enum(['paper', 'ink', 'lime']),
  quote: z.strictObject({
    frame,
    size: z.enum(['s', 'm', 'l']),
    font: z.enum(['serif', 'sans', 'mono', 'hand']).optional(),
    weight: z.enum(['regular', 'bold']).optional(),
    italic: z.boolean().optional(),
  }),
  elements: z.array(z.unknown()).max(ELEMENTS_MAX),
});

const note = z.strictObject({
  ...base,
  kind: z.literal('note'),
  text: sized(NOTE_MAX),
  hand: z.boolean().nullish(),
});

const translation = (max: number) =>
  z.strictObject({
    ...base,
    kind: z.literal('translation'),
    mode: z.enum(['translation', 'gloss']),
    lang: z.string().regex(/^[A-Za-z0-9-]{1,35}$/),
    text: sized(max),
    source: z.enum(['hand', 'mt']),
  });

const artwork = z.strictObject({
  ...base,
  kind: z.literal('artwork'),
  asset: z.string(),
  alt: sized(ALT_MAX),
  source: z.enum(['upload', 'drawing']),
});

const sticker = z.strictObject({
  ...base,
  kind: z.literal('sticker'),
  sticker: z.string().regex(/^[a-z0-9-]{1,32}\/[a-z0-9-]{1,32}$/),
});

const em = z.number();
const u32 = z
  .number()
  .int()
  .min(0)
  .max(2 ** 32 - 1);

const play = z.strictObject({
  id: base.id,
  kind: z.literal('play'),
  frame,
  contract: z.string(),
  alt: z.string(),
  shapes: z
    .array(
      z.discriminatedUnion('type', [
        z.strictObject({ id: z.string(), type: z.literal('circle'), r: em, pad: em }),
        z.strictObject({
          id: z.string(),
          type: z.literal('polygon'),
          pts: z.array(z.tuple([em, em])),
          pad: em,
        }),
      ]),
    )
    .nullish(),
  poses: z.array(z.strictObject({ shape: z.string(), x: em, y: em, rot: em })).nullish(),
  shapeMotion: z.string().nullish(),
  detach: z
    .strictObject({
      unit: z.string(),
      spans: z.array(z.tuple([u32, u32])),
      sink: z.string(),
      seed: u32,
    })
    .nullish(),
});

const unknownKind = z.looseObject({ id: base.id, kind: z.string() });

export type PayloadCheck =
  | { ok: true; translationScalars: number; localAssets: string[] }
  | { ok: false };

export const validatePayload = (
  payload: unknown,
  kind: string,
  quoteCost: number,
  capped: boolean,
  knownOnly = true,
): PayloadCheck => {
  const fail = { ok: false } as const;
  const env = envelope.safeParse(payload);
  if (!env.success) return fail;
  const ids = new Set<string>();
  const kinds = new Set<string>();
  const localAssets: string[] = [];
  let translationScalars = 0;
  let artworks = 0;
  for (const raw of env.data.elements) {
    const k = (raw as { kind?: unknown } | null)?.kind;
    if (typeof k !== 'string') return fail;
    let id: string;
    if (k === 'note') {
      const e = note.safeParse(raw);
      if (!e.success) return fail;
      id = e.data.id;
    } else if (k === 'translation') {
      const e = translation(translationMax(quoteCost, capped)).safeParse(raw);
      if (!e.success) return fail;
      translationScalars += scalars(e.data.text);
      id = e.data.id;
    } else if (k === 'artwork') {
      const e = artwork.safeParse(raw);
      if (!e.success) return fail;
      if (!knownOnly && LOCAL_ASSET.test(e.data.asset)) localAssets.push(e.data.asset);
      else if (!ASSET_ID.test(e.data.asset)) return fail;
      artworks += 1;
      id = e.data.id;
    } else if (k === 'sticker') {
      const e = sticker.safeParse(raw);
      if (!e.success) return fail;
      id = e.data.id;
    } else if (k === 'play') {
      const e = play.safeParse(raw);
      if (e.success && validatePlayElement(e.data, Infinity) === null) id = e.data.id;
      else {
        const newer = unknownKind.safeParse(raw);
        if (knownOnly || !newer.success || validatePlayElement(raw, Infinity) !== 'unknown')
          return fail;
        id = newer.data.id;
      }
    } else {
      const e = unknownKind.safeParse(raw);
      if (knownOnly || !e.success) return fail;
      id = e.data.id;
    }
    if (ids.has(id)) return fail;
    ids.add(id);
    kinds.add(k);
  }
  if (artworks > ARTWORK_MAX) return fail;
  if (env.data.elements.length === 0 ? kind !== 'clip' : !kinds.has(kind)) return fail;
  return { ok: true, translationScalars, localAssets: [...new Set(localAssets)] };
};
