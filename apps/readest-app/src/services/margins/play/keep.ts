import { getSession } from '@/services/ampleread/auth/session';
import type { BridgeContext } from '../anchorBridge';
import { quotaState, usedOn } from '../clip';
import { refreshCapped } from '../context';
import { hiddenMargins, type MarginDraft } from '../margins';
import {
  type Element,
  emptyEnvelope,
  envelopeBytes,
  PAYLOAD_MAX,
  PASSAGE_MAX,
  quoteCost,
} from '../payload';
import type { MarginsStore } from '../store';
import { cachedLink } from '../sync';
import type { Anchor } from '../types';
import { bytesToScalars, round2, validatePlayElement, type PlayElement } from './element';
import type { SessionState } from './session';

type Span = [number, number];

export type KeepResult =
  | { ok: true; layerId: string }
  | { ok: false; reason: 'empty' | 'quota' | 'size' | 'invalid' };

const enc = new TextEncoder();

export const keepSpan = (a: { detached: Span[]; shapeLines: Span[]; canonical: Uint8Array }) => {
  const all = [...a.detached, ...a.shapeLines];
  if (all.length === 0) return null;
  const start = Math.min(...all.map(([s]) => s));
  let capEnd = start;
  let n = 0;
  for (const ch of new TextDecoder().decode(a.canonical.subarray(start))) {
    if (n++ === PASSAGE_MAX) break;
    capEnd += enc.encode(ch).length;
  }
  const kept = all.filter(([, e]) => e <= capEnd);
  if (kept.length === 0) return null;
  return {
    start,
    end: Math.max(...kept.map(([, e]) => e)),
    dropped: a.detached.filter(([, e]) => e > capEnd).length,
  };
};

export const buildPlayElement = (a: {
  session: SessionState;
  spans: Span[];
  anchorStart: number;
  origin: { x: number; y: number };
  em: number;
  canonical: Uint8Array;
  alt: string;
}): PlayElement => {
  const { session, origin, em } = a;
  const ems = (v: number) => round2(v / em);
  const shaped = session.shapes.length > 0;
  return {
    id: 'p1',
    kind: 'play',
    frame: { x: 0.5, y: 0.6, w: 0.8, r: 0 },
    contract: shaped ? 'displace' : 'detach',
    alt: a.alt,
    ...(shaped && {
      shapes: session.shapes.map((s) =>
        s.type === 'circle'
          ? { id: s.id, type: 'circle' as const, r: ems(s.r!), pad: ems(s.pad) }
          : {
              id: s.id,
              type: 'polygon' as const,
              pts: s.pts!.map(([x, y]): Span => [ems(x), ems(y)]),
              pad: ems(s.pad),
            },
      ),
      poses: session.poses.map((p) => ({
        shape: p.shape,
        x: ems(p.x - origin.x),
        y: ems(p.y - origin.y),
        rot: round2(p.rot),
      })),
      shapeMotion: session.shapeMotion,
    }),
    ...(a.spans.length > 0 && {
      detach: {
        unit: session.unit,
        spans: bytesToScalars(a.canonical, a.anchorStart, a.spans),
        sink: 'floor' as const,
        seed: session.seed,
      },
    }),
  };
};

export const anchorLength = (anchor: Anchor) =>
  'exact' in anchor.quote ? [...anchor.quote.exact].length : anchor.quote.len;

export const playOverQuota = async (store: MarginsStore, ctx: BridgeContext, anchor: Anchor) => {
  const capped = await refreshCapped(ctx, store);
  const textId = cachedLink(ctx.book.hash)?.textId ?? null;
  const userId = (await getSession())?.me.id ?? null;
  const hidden = hiddenMargins();
  const rows = (await store.layersForReader(ctx.book.hash, textId ? [textId] : [], userId)).filter(
    (r) => !hidden.has(r.id) && (r.textId === textId || r.textId === null),
  );
  const cost = quoteCost(anchor.quote);
  return quotaState({ capped, used: usedOn(rows, capped), cost, quoteChars: cost }).kind === 'over';
};

export const keepPlay = async (d: {
  fileHash: string;
  createAnchor(): Promise<Anchor>;
  overQuota(anchor: Anchor): Promise<boolean>;
  element: PlayElement;
  save(draft: MarginDraft): Promise<string>;
}): Promise<KeepResult> => {
  const anchor = await d.createAnchor();
  if (await d.overQuota(anchor)) return { ok: false, reason: 'quota' };
  const envelope = { ...emptyEnvelope(), elements: [d.element as unknown as Element] };
  if (envelopeBytes(envelope) > PAYLOAD_MAX) return { ok: false, reason: 'size' };
  if (validatePlayElement(d.element, anchorLength(anchor)) !== null)
    return { ok: false, reason: 'invalid' };
  return { ok: true, layerId: await d.save({ fileHash: d.fileHash, anchor, envelope }) };
};
