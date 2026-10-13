import { createAnchorAt } from '../anchorBridge';
import { saveMargin } from '../margins';
import { buildPlayElement, keepPlay, keepSpan, playOverQuota } from './keep';
import { drift, lerpFactor } from './motion';
import { posesToPage, prepareReplay, type Replay, shapesToPage } from './replay';
import { createWorld, detachBodies, MAX_BODIES, removeBodies, step, type World } from './physics';
import { createGlyphCache, drawFrame, STRIDE } from './renderer';
import {
  addShape,
  detach,
  initialSession,
  lastSentenceSpan,
  moveShape,
  nextWordSpan,
  removeShape,
  undo,
  unitFor,
  wordSpanAt,
  type PlayKeepResult,
  type PlayShape,
  type PlayTools,
  type SessionState,
  type Unit,
} from './session';
import { createTierMonitor } from './tiers';
import { type EnterPlayArgs, type Page, preparePage } from './surfacePage';
import type { Box } from './window';

export { type EnterPlayArgs, PlayUnavailable } from './surfacePage';

export interface PlaySession {
  tools: PlayTools;
  canvas: HTMLCanvasElement;
  frameTimes: number[];
  frame(): Promise<void>;
  moveShapeTo(id: string, x: number, y: number): void;
  targets(): Float32Array;
  layoutKey(): string;
  active(): boolean;
  detachedText(): string;
  shapeCount(): number;
  exit(): void;
}

type Span = [number, number];

const FADE_MS = 150;
const IDLE_MS = 500;
const P2_BODIES = 150;
const P2_COMPOSE_MS = 50;
const MAX_SHAPES = 16;
const SETTLED_PX = 0.25;
const LIVE_TEXT = 'Play mode. The page is drawn for play; the text is unchanged.';

const shapePath = (shape: PlayShape, p: { x: number; y: number; rot: number }) => {
  const path = new Path2D();
  if (shape.type === 'circle') {
    path.arc(p.x, p.y, shape.r ?? 0, 0, Math.PI * 2);
    return path;
  }
  const [c, s] = [Math.cos(p.rot), Math.sin(p.rot)];
  (shape.pts ?? []).forEach(([x, y], i) => {
    const at: [number, number] = [p.x + x * c - y * s, p.y + x * s + y * c];
    if (i === 0) path.moveTo(...at);
    else path.lineTo(...at);
  });
  path.closePath();
  return path;
};

const engineShapes = (s: SessionState) =>
  JSON.stringify(
    s.shapes.map((x) =>
      x.type === 'circle'
        ? { type: 'circle', r: x.r, pad: x.pad }
        : { type: 'polygon', pts: x.pts, pad: x.pad },
    ),
  );

const posesOf = (s: SessionState) => s.shapes.map((x) => s.poses.find((p) => p.shape === x.id)!);

const targetsOf = (glyphs: Float32Array) => {
  const out = new Float32Array((glyphs.length / STRIDE) * 2);
  for (let i = 0; i < glyphs.length; i += STRIDE) {
    const k = (i / STRIDE) * 2;
    out[k] = glyphs[i]!;
    out[k + 1] = glyphs[i + 1]!;
  }
  return out;
};

const sameRange = (x: Range, y: Range) => {
  try {
    return (
      x.compareBoundaryPoints(Range.START_TO_START, y) === 0 &&
      x.compareBoundaryPoints(Range.END_TO_END, y) === 0
    );
  } catch {
    return false;
  }
};

const mountSurface = (host: HTMLElement, box: Box, reduced: boolean) => {
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'absolute',
    left: `${box.x}px`,
    top: `${box.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    touchAction: 'none',
  });
  canvas.width = Math.round(box.width * dpr);
  canvas.height = Math.round(box.height * dpr);
  const live = document.createElement('div');
  live.setAttribute('aria-live', 'polite');
  live.className = 'sr-only';
  host.append(canvas, live);
  if (!reduced) canvas.animate([{ opacity: 0 }, { opacity: 1 }], FADE_MS);
  requestAnimationFrame(() => {
    live.textContent = LIVE_TEXT;
  });
  const g = canvas.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { canvas, live, g };
};

const mountProxy = (
  host: HTMLElement,
  shape: PlayShape,
  em: number,
  move: (dx: number, dy: number) => void,
) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute(
    'aria-label',
    shape.type === 'circle'
      ? 'Circle shape. Arrow keys move it.'
      : 'Triangle shape. Arrow keys move it.',
  );
  Object.assign(b.style, {
    position: 'absolute',
    width: '24px',
    height: '24px',
    opacity: '0',
    padding: '0',
    border: '0',
  });
  b.addEventListener('focus', () => (b.style.opacity = '1'));
  b.addEventListener('blur', () => (b.style.opacity = '0'));
  b.addEventListener('keydown', (e) => {
    const d = em * (e.shiftKey ? 2 : 0.5);
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-d, 0],
      ArrowRight: [d, 0],
      ArrowUp: [0, -d],
      ArrowDown: [0, d],
    };
    const m = delta[e.key];
    if (!m) return;
    e.preventDefault();
    move(...m);
  });
  host.append(b);
  return b;
};

export const enterPlay = async (a: EnterPlayArgs): Promise<PlaySession> => {
  if (!a.layerId) return startSession(a, await preparePage(a));
  const { args, replay } = await prepareReplay(a);
  return startSession(args, await preparePage(args), replay);
};

const startSession = (a: EnterPlayArgs, page: Page, replay?: Replay): PlaySession => {
  const { host, renderer, reduced } = a;
  const { engine, win, box, em } = page;
  const glue = engine.glue;
  const { canvas, live, g } = mountSurface(host, box, reduced);
  const saved = {
    opacity: renderer.style.opacity,
    pointerEvents: renderer.style.pointerEvents,
  };
  renderer.style.opacity = '0';
  renderer.style.pointerEvents = 'none';

  const seed = replay?.element.detach?.seed ?? Math.floor(Math.random() * 2 ** 31);
  const cache = createGlyphCache((face, gid) => glue.outline(face, gid));
  const textBytes = new TextEncoder().encode(win.text);
  const decoder = new TextDecoder();
  const tier = createTierMonitor();
  const frameTimes: number[] = [];
  const proxies = new Map<string, HTMLButtonElement>();
  const flown = new Map<number, [number, number]>();
  const bodyIndex = new Map<number, number>();
  let s = initialSession(seed);
  let world: World = createWorld(box.width, box.height, seed);
  let unit: Unit | null = null;
  let glyphs = glue.glyphs();
  let lines = glue.lines();
  const entry = { glyphs, lines };
  let current = targetsOf(glyphs);
  let bodyGlyphs = new Float32Array(0);
  let sentShapes = s.shapes;
  let sentDetached = s.detached;
  let lastCompose = 0;
  let composedOnce = false;
  let dragging: { id: string; x: number; y: number } | null = null;
  let active = true;
  let paused = document.hidden;
  let raf = 0;
  let last = performance.now();
  let lastMove = last;

  const cluster = (canon: number, len: number) =>
    decoder.decode(textBytes.subarray(canon - win.start, canon - win.start + len));

  const remap = (next: Float32Array) => {
    const prev = new Map<number, [number, number]>();
    for (let i = 0; i < glyphs.length; i += STRIDE) {
      const k = (i / STRIDE) * 2;
      prev.set(glyphs[i + 7]!, [current[k]!, current[k + 1]!]);
    }
    const out = targetsOf(next);
    for (let i = 0; i < next.length; i += STRIDE) {
      const k = (i / STRIDE) * 2;
      const from = prev.get(next[i + 7]!) ?? flown.get(next[i + 7]!);
      if (from) [out[k], out[k + 1]] = from;
    }
    flown.clear();
    glyphs = next;
    current = out;
  };

  const mayCompose = (now: number) => {
    switch (tier.tier) {
      case 'P1':
        return true;
      case 'P2':
        return now - lastCompose >= P2_COMPOSE_MS;
      case 'P3':
        return !dragging;
      default:
        return !composedOnce;
    }
  };

  const syncEngine = (now: number) => {
    if (s.shapes !== sentShapes) {
      glue.set_shapes(engineShapes(s));
      sentShapes = s.shapes;
    }
    glue.set_poses(Float32Array.from(posesOf(s).flatMap((p) => [p.x, p.y, p.rot])));
    if (s.detached !== sentDetached) {
      glue.set_removed(Uint32Array.from(s.detached.flat()));
      sentDetached = s.detached;
    }
    if (!mayCompose(now)) return;
    lastCompose = now;
    composedOnce = true;
    if (!glue.compose()) return;
    remap(glue.glyphs());
    lines = glue.lines();
  };

  const lerp = (dt: number) => {
    const k = lerpFactor(dt, reduced);
    let moving = false;
    for (let i = 0; i < glyphs.length; i += STRIDE) {
      const j = (i / STRIDE) * 2;
      for (let c = 0; c < 2; c++) {
        const d = glyphs[i + c]! - current[j + c]!;
        if (Math.abs(d) <= SETTLED_PX) current[j + c] = glyphs[i + c]!;
        else {
          current[j + c] = current[j + c]! + d * k;
          moving = true;
        }
      }
    }
    return moving;
  };

  const draw = () => {
    g.clearRect(0, 0, box.width, box.height);
    if (page.bg && page.bg !== 'rgba(0, 0, 0, 0)') {
      g.fillStyle = page.bg;
      g.fillRect(0, 0, box.width, box.height);
    }
    for (const i of page.images) g.drawImage(i.img, i.x, i.y, i.w, i.h);
    const poses = posesOf(s);
    drawFrame(g, {
      glyphs,
      current,
      cache,
      color: page.color,
      bodies: world.bodies,
      bodyGlyphs,
      bodyGlyph: (canon) => bodyIndex.get(canon) ?? -1,
      cluster,
      shapes: s.shapes.map((x, i) => shapePath(x, poses[i]!)),
      shapeColor: page.color,
    });
  };

  const placeProxies = () => {
    for (const p of s.poses) {
      const b = proxies.get(p.shape);
      if (b)
        Object.assign(b.style, {
          left: `${box.x + p.x - 12}px`,
          top: `${box.y + p.y - 12}px`,
        });
    }
  };

  const tick = (now: number) => {
    const t0 = performance.now();
    const dt = Math.min(100, Math.max(0, now - last));
    last = now;
    if (s.shapeMotion === 'drift')
      s = {
        ...s,
        poses: s.poses.map((p, i) => ({ ...p, ...drift(now, i, box) })),
      };
    const flying = world.bodies.some((b) => !b.rest);
    if (flying) world = step(world);
    syncEngine(now);
    const moving = lerp(dt) || flying || s.shapeMotion === 'drift' || !!dragging;
    draw();
    placeProxies();
    if (moving) lastMove = now;
    const ms = performance.now() - t0;
    frameTimes.push(ms);
    tier.record(ms);
  };

  const loop = (now: number) => {
    raf = 0;
    if (!active || paused) return;
    tick(now);
    if (now - lastMove < IDLE_MS) raf = requestAnimationFrame(loop);
  };

  const wake = () => {
    lastMove = performance.now();
    if (!raf && active && !paused) raf = requestAnimationFrame(loop);
  };

  const glyphsIn = (spans: Span[]) => {
    const out: {
      canon: number;
      len: number;
      x: number;
      y: number;
      w: number;
      h: number;
    }[] = [];
    const at: number[] = [];
    for (let i = 0; i < glyphs.length; i += STRIDE) {
      const c = glyphs[i + 7]!;
      if (!spans.some(([x, y]) => c >= x && c < y)) continue;
      const k = (i / STRIDE) * 2;
      const [w, h] = [glyphs[i + 2]!, glyphs[i + 3]!];
      out.push({
        canon: c,
        len: glyphs[i + 8]!,
        x: current[k]!,
        y: current[k + 1]!,
        w,
        h,
      });
      at.push(i);
    }
    return { out, at };
  };

  const doDetach = (spans: Span[], settled = false) => {
    const { out, at } = glyphsIn(spans);
    const records = new Float32Array(bodyGlyphs.length + at.length * STRIDE);
    records.set(bodyGlyphs);
    at.forEach((i, n) => {
      const to = bodyGlyphs.length + n * STRIDE;
      records.set(glyphs.subarray(i, i + STRIDE), to);
      bodyIndex.set(glyphs[i + 7]!, to);
    });
    bodyGlyphs = records;
    const settle = settled || reduced || tier.tier === 'P3' || tier.tier === 'P4';
    world = detachBodies(world, out, settle, tier.tier === 'P1' ? MAX_BODIES : P2_BODIES);
    s = detach(s, spans);
    wake();
  };

  const lineRange = (l: number): Span => {
    const [first, count] = [lines[l + 5]!, lines[l + 6]!];
    const end = (first + count - 1) * STRIDE;
    return [glyphs[first * STRIDE + 7]!, glyphs[end + 7]! + glyphs[end + 8]!];
  };

  const lineSpan = (n: number): Span | null => {
    for (let l = 0; l < lines.length; l += 7) {
      const [first, count] = [lines[l + 5]!, lines[l + 6]!];
      if (n >= first && n < first + count) return lineRange(l);
    }
    return null;
  };

  const shapeLine = (shape: PlayShape, p: { x: number; y: number }): Span | null => {
    const reach =
      shape.pad +
      (shape.type === 'circle'
        ? (shape.r ?? 0)
        : Math.max(0, ...(shape.pts ?? []).map(([x, y]) => Math.hypot(x, y))));
    for (let l = 0; l < lines.length; l += 7) {
      const [base, ascent, descent, count] = [
        lines[l + 2]!,
        lines[l + 3]!,
        lines[l + 4]!,
        lines[l + 6]!,
      ];
      if (count > 0 && base - ascent < p.y + reach && base + descent > p.y - reach)
        return lineRange(l);
    }
    return null;
  };

  const firstLine = (): Span[] => {
    for (let l = 0; l < lines.length; l += 7) if (lines[l + 6]! > 0) return [lineRange(l)];
    return [];
  };

  const entryOrigin = (start: number) => {
    const { glyphs: g, lines: ls } = entry;
    let i = 0;
    while (i < g.length && g[i + 7]! < start) i += STRIDE;
    if (i >= g.length) return { x: 0, y: 0 };
    const n = i / STRIDE;
    for (let l = 0; l < ls.length; l += 7)
      if (n >= ls[l + 5]! && n < ls[l + 5]! + ls[l + 6]!)
        return { x: g[i]!, y: ls[l + 2]! - ls[l + 3]! };
    return { x: g[i]!, y: g[i + 1]! };
  };

  const keep = async (alt: string): Promise<PlayKeepResult> => {
    const store = a.store;
    if (!store) return { ok: false, reason: 'invalid' };
    const section = await a.ctx.core.canonicalSection(a.ctx.book.hash, a.index);
    const canonical = new TextEncoder().encode(section.text);
    const poses = posesOf(s);
    const hits = s.shapes.map((x, i) => shapeLine(x, poses[i]!)).filter((x): x is Span => !!x);
    const shapeLines =
      hits.length > 0 || s.detached.length > 0 || s.shapes.length === 0 ? hits : firstLine();
    const span = keepSpan({ detached: s.detached, shapeLines, canonical });
    if (!span) return { ok: false, reason: 'empty' };
    const element = buildPlayElement({
      session: s,
      spans: s.detached.filter(([, e]) => e <= span.end),
      anchorStart: span.start,
      origin: entryOrigin(span.start),
      em,
      canonical,
      alt,
    });
    const result = await keepPlay({
      fileHash: a.ctx.book.hash,
      createAnchor: () => createAnchorAt(a.ctx, a.index, span.start, span.end),
      overQuota: (anchor) => playOverQuota(store, a.ctx, anchor),
      element,
      save: (draft) => saveMargin(store, draft),
    });
    return result.ok ? { ...result, dropped: span.dropped } : result;
  };

  const spanAt = (byte: number, u: Unit): Span | null => {
    for (let i = 0; i < glyphs.length; i += STRIDE) {
      const [c, len] = [glyphs[i + 7]!, glyphs[i + 8]!];
      if (byte < c || byte >= c + len) continue;
      if (u === 'glyph') return [c, c + len];
      if (u === 'word') return wordSpanAt(win.text, win.start, byte);
      return lineSpan(i / STRIDE);
    }
    return null;
  };

  const local = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const shapeAt = (x: number, y: number) =>
    [...s.poses].reverse().find((p) => Math.hypot(p.x - x, p.y - y) <= em * 3)?.shape ?? null;

  const onPointerDown = (e: PointerEvent) => {
    const at = local(e);
    const id = shapeAt(at.x, at.y);
    if (id) {
      dragging = { id, ...at };
      canvas.setPointerCapture?.(e.pointerId);
      wake();
      return;
    }
    if (!unit) return;
    const byte = glue.hit(at.x, at.y);
    const span = byte >= 0 ? spanAt(byte, unit) : null;
    if (span) doDetach([span]);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const at = local(e);
    s = moveShape(s, dragging.id, at.x - dragging.x, at.y - dragging.y);
    dragging = { ...dragging, ...at };
    wake();
  };

  const onPointerUp = () => {
    if (!dragging) return;
    dragging = null;
    wake();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      exit();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.stopPropagation();
      tools.undo();
    }
  };

  const onRelocate = (e: Event) => {
    const moved = (e as CustomEvent<{ range?: Range }>).detail?.range;
    if (!moved || !sameRange(moved, a.range)) exit();
  };

  const onVisibility = () => {
    paused = document.hidden;
    if (!paused) wake();
  };

  const exit = () => {
    if (!active) return;
    active = false;
    if (raf) cancelAnimationFrame(raf);
    renderer.removeEventListener('relocate', onRelocate);
    window.removeEventListener('resize', exit);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onVisibility);
    renderer.style.opacity = saved.opacity;
    renderer.style.pointerEvents = saved.pointerEvents;
    live.remove();
    for (const b of proxies.values()) b.remove();
    if (reduced) canvas.remove();
    else
      canvas
        .animate([{ opacity: 1 }, { opacity: 0 }], FADE_MS)
        .finished.finally(() => canvas.remove());
    a.onExit?.();
  };

  const mountShapeProxy = (shape: PlayShape) => {
    const proxy = mountProxy(host, shape, em, (dx, dy) => {
      s = moveShape(s, shape.id, dx, dy);
      wake();
    });
    proxies.set(shape.id, proxy);
  };

  const applyReplay = (r: Replay) => {
    const shapes = shapesToPage(r.element, em).slice(0, MAX_SHAPES);
    const poses = posesToPage(r.element, entryOrigin(r.anchorStart), em);
    s = {
      ...s,
      shapes,
      poses: shapes.map(
        (x) => poses.find((p) => p.shape === x.id) ?? { shape: x.id, x: 0, y: 0, rot: 0 },
      ),
      shapeMotion: r.element.shapeMotion ?? 'none',
    };
    shapes.forEach(mountShapeProxy);
    syncEngine(performance.now());
    current = targetsOf(glyphs);
    const spans = r.spans.filter(([x, y]) => x >= win.start && y <= win.end);
    if (spans.length > 0) doDetach(spans, true);
  };

  const detachedText = () =>
    [...s.detached]
      .sort((x, y) => x[0] - y[0])
      .map(([x, y]) => cluster(x, y - x))
      .join(' ');

  const tools: PlayTools = {
    enter: async () => undefined,
    exit,
    keep,
    addShape(kind) {
      if (s.shapes.length >= MAX_SHAPES) return '';
      const n = s.shapes.length;
      s = addShape(s, kind, { x: box.width / 2 - n * em, y: box.height / 3 + n * em }, em);
      const shape = s.shapes[s.shapes.length - 1]!;
      mountShapeProxy(shape);
      wake();
      return shape.id;
    },
    removeShape(id) {
      s = removeShape(s, id);
      proxies.get(id)?.remove();
      proxies.delete(id);
      wake();
    },
    setShapeMotion(preset) {
      s = { ...s, shapeMotion: preset };
      wake();
    },
    detachMode(u) {
      unit = u ? unitFor(u, win.text) : null;
    },
    detachNext() {
      const after = s.detached[s.detached.length - 1]?.[1] ?? win.start;
      const span = nextWordSpan(win.text, win.start, after, 'word', s.detached);
      if (span) doDetach([span]);
    },
    shake() {
      const over = glue.overset_at();
      const span = lastSentenceSpan(win.text, win.start, over >= 0 ? over : win.end, s.detached);
      if (span) doDetach([span]);
    },
    undo() {
      const spans = s.undo[s.undo.length - 1];
      if (!spans) return;
      s = undo(s);
      const canons = new Set<number>();
      for (const b of world.bodies) {
        if (!spans.some(([x, y]) => b.canon >= x && b.canon < y)) continue;
        canons.add(b.canon);
        flown.set(b.canon, [b.x, b.y + b.h * 0.35]);
        bodyIndex.delete(b.canon);
      }
      world = removeBodies(world, canons);
      wake();
    },
    canUndo: () => s.undo.length > 0,
    get state() {
      return {
        active,
        tier: tier.tier,
        font: page.font,
        canUndo: s.undo.length > 0,
        unit,
        shapeMotion: s.shapeMotion,
      };
    },
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  renderer.addEventListener('relocate', onRelocate);
  window.addEventListener('resize', exit);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('visibilitychange', onVisibility);
  if (replay) applyReplay(replay);
  draw();
  wake();

  return {
    tools,
    canvas,
    frameTimes,
    frame: () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame((now) => {
          if (active) tick(now);
          resolve();
        }),
      ),
    moveShapeTo(id, x, y) {
      const p = s.poses.find((q) => q.shape === id);
      if (!p) return;
      s = moveShape(s, id, x - p.x, y - p.y);
      wake();
    },
    targets: () => targetsOf(glyphs),
    layoutKey: () => Array.from(lines, (v) => v.toFixed(1)).join(','),
    active: () => active,
    detachedText,
    shapeCount: () => s.shapes.length,
    exit,
  };
};
