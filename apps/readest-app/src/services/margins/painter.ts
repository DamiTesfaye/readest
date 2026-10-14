import type { MarginsDisplay } from '@/types/book';
import type { AnchorPlacement } from './anchorBridge';
import type { LayerRow } from './store';

export type Placement =
  | { kind: 'placed'; section: number; start: number; end: number; step: 1 | 2 | 3 }
  | { kind: 'gap'; section: number; at: number }
  | { kind: 'elsewhere' }
  | { kind: 'detached' };

type Draw = (rects: DOMRect[], o: object) => SVGElement;

export interface PainterOverlayer {
  add(key: string, range: Range, draw: Draw, opts: object): void;
  remove(key: string): void;
}

export interface MarginCreator {
  name: string;
  avatarUrl: string | null;
  color: string;
  initial: string;
}

export interface MarginDrawOptions {
  count: number;
  fuzzy: boolean;
  markers: boolean;
  gap?: boolean;
  creator?: MarginCreator;
}

export interface MarginsPainter {
  resolveAll(rows: LayerRow[], onBatch?: () => void): Promise<void>;
  drawSection(
    index: number,
    overlayer: PainterOverlayer,
    display: MarginsDisplay,
  ): Promise<string[]>;
  placements(): ReadonlyMap<string, Placement>;
  creatorOf(id: string): MarginCreator | undefined;
  rowOf(id: string): LayerRow | undefined;
}

export const MARGIN_KEY_PREFIX = 'margins:';
export const MARGIN_COLOR = '#5B3DF5';
export const CREATOR_COLORS = [
  '#5B3DF5',
  '#E8846B',
  '#2E7D6B',
  '#C2185B',
  '#D9A400',
  '#1E88E5',
  '#8E5CC4',
  '#E0613D',
];

export const creatorColor = (userId: string): string => {
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return CREATOR_COLORS[hash % CREATOR_COLORS.length]!;
};

const BATCH = 20;
const MARKER = 14;
const AVATAR = 18;
const SAME_LINE_PX = 2;
const PARAGRAPH_MERGE_ABOVE = 200;
const SVG_NS = 'http://www.w3.org/2000/svg';

export const cacheKey = (row: LayerRow): string =>
  row.rev === null ? `${row.id}@local:${row.updatedAt}` : `${row.id}@${row.rev}:${row.updatedAt}`;

export const placementOf = (p: AnchorPlacement): Placement => {
  if (p.canonical && p.sectionIndex !== null && p.step) {
    const [start, end] = p.canonical;
    return { kind: 'placed', section: p.sectionIndex, start, end, step: p.step };
  }
  if (!p.notInThisVersion) return { kind: 'detached' };
  const { at } = p.notInThisVersion;
  return p.sectionIndex !== null && at !== null
    ? { kind: 'gap', section: p.sectionIndex, at }
    : { kind: 'elsewhere' };
};

export const marginIdsOfKey = (key: string): string[] => {
  const rest = key.slice(MARGIN_KEY_PREFIX.length);
  return rest.startsWith('cluster:') ? rest.slice('cluster:'.length).split(',') : [rest];
};

const svg = (tag: string, attrs: Record<string, string | number>) => {
  const el = document.createElementNS(SVG_NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

const box = (left: number, top: number, size: number) =>
  ({ left, top, right: left + size, bottom: top + size, width: size, height: size }) as DOMRect;

const drawMarker = (g: SVGElement, cx: number, cy: number, r: number, o: MarginDrawOptions) => {
  const color = o.creator?.color ?? MARGIN_COLOR;
  g.append(svg('circle', { cx, cy, r, fill: color }));
  if (o.fuzzy) {
    g.append(
      svg('circle', {
        cx,
        cy,
        r: r + 2,
        fill: 'none',
        stroke: color,
        'stroke-dasharray': '2 2',
      }),
    );
  }
  const label = o.count > 1 ? String(o.count) : (o.creator?.initial ?? '');
  if (label) {
    const text = svg('text', {
      x: cx,
      y: cy,
      fill: '#fff',
      'font-size': 9,
      'font-family': 'sans-serif',
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
    });
    text.textContent = label;
    g.append(text);
  }
};

export const drawMargin = (rects: DOMRect[], o: MarginDrawOptions): SVGElement => {
  const g = svg('g', { 'aria-hidden': 'true' });
  const first = rects[0];
  const last = rects[rects.length - 1];
  if (!first || !last) return g;
  const color = o.creator?.color ?? MARGIN_COLOR;
  if (o.gap) {
    const x = last.left;
    const y = last.top + (last.height - MARKER) / 2;
    g.append(
      svg('path', {
        d: `M ${x + 5} ${y} H ${x} V ${y + MARKER} H ${x + 5}`,
        fill: 'none',
        stroke: color,
        'stroke-width': 2,
      }),
    );
    rects.splice(0, rects.length, box(x - 2, y, MARKER));
    return g;
  }
  if (!o.markers) {
    for (const r of rects) {
      g.append(
        svg('rect', {
          x: r.left,
          y: r.top,
          width: r.width,
          height: r.height,
          fill: color,
          'fill-opacity': 0.18,
        }),
      );
    }
  }
  const size = o.creator ? AVATAR : MARKER;
  const r = size / 2;
  const cx = first.left;
  const cy = first.top;
  drawMarker(g, cx, cy, r, o);
  const marker = box(cx - r, cy - r, size);
  if (o.markers) rects.splice(0, rects.length, marker);
  else rects.push(marker);
  return g;
};

const idle = () =>
  new Promise<void>((done) =>
    typeof requestIdleCallback === 'function'
      ? requestIdleCallback(() => done(), { timeout: 200 })
      : setTimeout(done, 0),
  );

const union = (ranges: Range[]) => {
  const r = ranges[0]!.cloneRange();
  for (const o of ranges.slice(1)) {
    if (o.compareBoundaryPoints(Range.START_TO_START, r) < 0) {
      r.setStart(o.startContainer, o.startOffset);
    }
    if (o.compareBoundaryPoints(Range.END_TO_END, r) > 0) r.setEnd(o.endContainer, o.endOffset);
  }
  return r;
};

const paragraphOf = (range: Range): Node => {
  const n = range.startContainer;
  return (n.nodeType === Node.ELEMENT_NODE ? (n as Element) : n.parentElement) ?? n;
};

type Member = { id: string; range: Range; step: number; start: number };

const groupMembers = (members: Member[]) => {
  const groups: { line: number | Node; members: Member[] }[] = [];
  const byParagraph = members.length > PARAGRAPH_MERGE_ABOVE;
  for (const m of members) {
    const line = byParagraph ? paragraphOf(m.range) : (m.range.getClientRects()[0]?.top ?? NaN);
    const group = groups.find((g) =>
      byParagraph
        ? g.line === line
        : Math.abs((g.line as number) - (line as number)) < SAME_LINE_PX,
    );
    if (group) group.members.push(m);
    else groups.push({ line, members: [m] });
  }
  return groups.map((g) => g.members);
};

export const createPainter = (o: {
  resolve: (row: LayerRow) => Promise<Placement>;
  liveRange: (section: number, start: number, end: number) => Promise<Range | null>;
  creator?: (userId: string | null) => MarginCreator;
}): MarginsPainter => {
  const cache = new Map<string, Placement>();
  const placed = new Map<string, Placement>();
  const drawn = new Map<number, Set<string>>();
  const queues = new Map<number, Promise<unknown>>();
  const ranges = new Map<string, Range>();
  const authors = new Map<string, string | null>();
  const rowsById = new Map<string, LayerRow>();

  const rangeFor = async (index: number, start: number, end: number) => {
    const key = `${index}:${start}:${end}`;
    const hit = ranges.get(key);
    if (hit?.startContainer.ownerDocument?.defaultView) return hit;
    const range = await o.liveRange(index, start, end);
    if (range) ranges.set(key, range);
    else ranges.delete(key);
    return range;
  };

  const resolveOne = async (row: LayerRow) => {
    const key = cacheKey(row);
    let placement = cache.get(key);
    if (!placement) {
      placement = await o.resolve(row).catch((): Placement => ({ kind: 'detached' }));
      cache.set(key, placement);
    }
    placed.set(row.id, placement);
    authors.set(row.id, row.userId ?? null);
    rowsById.set(row.id, row);
  };

  const gapRange = async (section: number, at: number) => {
    const r = await o.liveRange(section, at, at);
    if (!r) return null;
    r.collapse(true);
    const n = r.startContainer;
    if (n.nodeType === Node.TEXT_NODE && r.startOffset < (n.nodeValue?.length ?? 0)) {
      r.setEnd(n, r.startOffset + 1);
    }
    return r;
  };

  const plan = async (index: number, display: MarginsDisplay) => {
    const next = new Map<string, { range: Range; opts: MarginDrawOptions }>();
    if (display === 'quiet') return next;
    const members: Member[] = [];
    for (const [id, p] of placed) {
      if (p.kind === 'placed' && p.section === index) {
        const range = await rangeFor(index, p.start, p.end);
        if (range) members.push({ id, range, step: p.step, start: p.start });
      } else if (p.kind === 'gap' && p.section === index && display === 'full') {
        const range = await gapRange(index, p.at);
        const opts = {
          count: 1,
          fuzzy: false,
          markers: false,
          gap: true,
          creator: o.creator?.(authors.get(id) ?? null),
        };
        if (range) next.set(MARGIN_KEY_PREFIX + id, { range, opts });
      }
    }
    members.sort((a, b) => a.start - b.start);
    for (const group of groupMembers(members)) {
      const ids = group.map((m) => m.id);
      const key = MARGIN_KEY_PREFIX + (ids.length > 1 ? `cluster:${ids.join(',')}` : ids[0]);
      next.set(key, {
        range: group.length > 1 ? union(group.map((m) => m.range)) : group[0]!.range,
        opts: {
          count: group.length,
          fuzzy: group.some((m) => m.step === 3),
          markers: display === 'markers',
          creator: o.creator?.(authors.get(group[0]!.id) ?? null),
        },
      });
    }
    return next;
  };

  const paint = async (index: number, overlayer: PainterOverlayer, display: MarginsDisplay) => {
    const next = await plan(index, display);
    for (const key of drawn.get(index) ?? []) if (!next.has(key)) overlayer.remove(key);
    for (const [key, { range, opts }] of next) overlayer.add(key, range, drawMargin as Draw, opts);
    drawn.set(index, new Set(next.keys()));
    return [...next.keys()];
  };

  return {
    async resolveAll(rows, onBatch) {
      const live = new Set(rows.map((r) => r.id));
      for (const id of [...placed.keys()]) {
        if (live.has(id)) continue;
        placed.delete(id);
        rowsById.delete(id);
        authors.delete(id);
      }
      for (let i = 0; i < rows.length; i += BATCH) {
        if (i > 0) await idle();
        await Promise.all(rows.slice(i, i + BATCH).map(resolveOne));
        onBatch?.();
      }
    },
    drawSection(index, overlayer, display) {
      const run = (queues.get(index) ?? Promise.resolve())
        .catch(() => {})
        .then(() => paint(index, overlayer, display));
      queues.set(index, run);
      return run;
    },
    placements: () => placed,
    rowOf: (id) => rowsById.get(id),
    creatorOf: (id) => (authors.has(id) ? o.creator?.(authors.get(id) ?? null) : undefined),
  };
};
