import type { Body } from './physics';

export const STRIDE = 10;

export type GlyphCache = ReturnType<typeof createGlyphCache>;

export const createGlyphCache = (outline: (face: number, gid: number) => string, max = 4096) => {
  const cache = new Map<string, Path2D | null>();
  return {
    get size() {
      return cache.size;
    },
    get(face: number, gid: number): Path2D | null {
      const key = `${face}:${gid}`;
      const hit = cache.get(key);
      if (hit !== undefined) {
        cache.delete(key);
        cache.set(key, hit);
        return hit;
      }
      const d = outline(face, gid);
      const path = d ? new Path2D(d) : null;
      cache.set(key, path);
      if (cache.size > max) cache.delete(cache.keys().next().value!);
      return path;
    },
  };
};

export interface FrameArgs {
  glyphs: Float32Array;
  current: Float32Array;
  cache: GlyphCache;
  color: string;
  bodies: readonly Body[];
  bodyGlyph: (canon: number) => number;
  cluster: (i: number) => string;
  shapes: Path2D[];
  shapeColor: string;
}

const drawGlyph = (ctx: CanvasRenderingContext2D, a: FrameArgs, i: number, at: DOMMatrix) => {
  const size = a.glyphs[i + 3]!;
  const path = a.cache.get(a.glyphs[i + 5]!, a.glyphs[i + 6]!);
  if (path) {
    ctx.setTransform(at.scale(size * a.glyphs[i + 4]!, size));
    ctx.fill(path);
    return;
  }
  ctx.setTransform(at);
  ctx.font = `${size}px sans-serif`;
  ctx.fillText(a.cluster(i), 0, 0);
};

export const drawFrame = (ctx: CanvasRenderingContext2D, a: FrameArgs) => {
  const base = ctx.getTransform();
  ctx.fillStyle = a.color;
  for (let i = 0; i < a.glyphs.length; i += STRIDE) {
    if (!(a.glyphs[i + 9]! & 1)) continue;
    const k = (i / STRIDE) * 2;
    drawGlyph(ctx, a, i, base.translate(a.current[k]!, a.current[k + 1]!));
  }
  for (const b of a.bodies) {
    const i = a.bodyGlyph(b.canon);
    if (i < 0) continue;
    drawGlyph(ctx, a, i, base.translate(b.x, b.y).rotate((b.ang * 180) / Math.PI));
  }
  ctx.setTransform(base);
  ctx.fillStyle = a.shapeColor;
  for (const p of a.shapes) ctx.fill(p);
};
