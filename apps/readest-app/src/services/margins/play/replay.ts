import type { Renderer } from '@/types/view';
import { type AnchorPlacement, resolveAnchor } from '../anchorBridge';
import { type PlayElement, scalarsToBytes, validatePlayElement } from './element';
import type { PlayShape, Pose } from './session';
import { type EnterPlayArgs, PlayUnavailable } from './surfacePage';

type Span = [number, number];

export interface Replay {
  element: PlayElement;
  anchorStart: number;
  spans: Span[];
}

const RELOCATE_MS = 2000;

export const replayPlan = (a: {
  element: PlayElement;
  placement: AnchorPlacement;
  canonical: Uint8Array;
  anchorStart: number;
}) => {
  const { step } = a.placement;
  if (step === null) return null;
  const spans =
    step === 3 || !a.element.detach
      ? []
      : scalarsToBytes(a.canonical, a.anchorStart, a.element.detach.spans);
  return { shapes: (a.element.shapes?.length ?? 0) > 0, spans };
};

export const posesToPage = (
  element: PlayElement,
  origin: { x: number; y: number },
  em: number,
): Pose[] =>
  (element.poses ?? []).map((p) => ({
    shape: p.shape,
    x: origin.x + p.x * em,
    y: origin.y + p.y * em,
    rot: p.rot,
  }));

export const shapesToPage = (element: PlayElement, em: number): PlayShape[] =>
  (element.shapes ?? []).map((s) =>
    s.type === 'circle'
      ? { id: s.id, type: 'circle', r: s.r * em, pad: s.pad * em }
      : {
          id: s.id,
          type: 'polygon',
          pts: s.pts.map(([x, y]) => [x * em, y * em]),
          pad: s.pad * em,
        },
  );

const playElementOf = (payload: unknown) =>
  ((payload as { elements?: unknown[] } | null)?.elements ?? []).find(
    (e) => (e as { kind?: unknown } | null)?.kind === 'play',
  ) as PlayElement | undefined;

const relocated = (renderer: Renderer) =>
  new Promise<Range | null>((resolve) => {
    const on = (e: Event) => {
      const range = (e as CustomEvent<{ range?: Range }>).detail?.range;
      if (range && !range.collapsed) done(range);
    };
    const done = (range: Range | null) => {
      clearTimeout(timer);
      renderer.removeEventListener('relocate', on);
      resolve(range);
    };
    const timer = setTimeout(() => done(null), RELOCATE_MS);
    renderer.addEventListener('relocate', on);
  });

export const prepareReplay = async (
  a: EnterPlayArgs,
): Promise<{ args: EnterPlayArgs; replay: Replay }> => {
  const row = a.store && a.layerId ? await a.store.getLayer(a.layerId) : null;
  const element = row && !row.deleted ? playElementOf(row.payload) : undefined;
  if (!row || !element || validatePlayElement(element, Infinity) !== null)
    throw new PlayUnavailable('not-placed');
  let placement = await resolveAnchor(a.ctx, row.anchor);
  if (placement.step !== null && placement.sectionIndex !== null && !placement.range) {
    await a.renderer.goTo({ index: placement.sectionIndex });
    placement = await resolveAnchor(a.ctx, row.anchor);
  }
  const { range, sectionIndex: index, canonical: at } = placement;
  if (placement.step === null || index === null || !range || !at)
    throw new PlayUnavailable('not-placed');
  const moved = relocated(a.renderer);
  await a.renderer.goTo({ index, anchor: () => range });
  const visible = (await moved) ?? (index === a.index ? a.range : null);
  if (!visible) throw new PlayUnavailable('range');
  const section = await a.ctx.core.canonicalSection(a.ctx.book.hash, index);
  const canonical = new TextEncoder().encode(section.text);
  const plan = replayPlan({ element, placement, canonical, anchorStart: at[0] });
  return {
    args: { ...a, index, range: visible },
    replay: { element, anchorStart: at[0], spans: plan?.spans ?? [] },
  };
};
