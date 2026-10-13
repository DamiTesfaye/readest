export const MAX_BODIES = 600;
const COL = 4;
const G = 0.55;

export interface Body {
  canon: number;
  len: number;
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  ang: number;
  va: number;
  rest: boolean;
  delay: number;
}

export interface World {
  bodies: readonly Body[];
  floor: Float32Array;
  width: number;
  height: number;
  seed: number;
}

export type Glyph = {
  canon: number;
  len: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export const mulberry32 = (seed: number) => {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const createWorld = (width: number, height: number, seed: number): World => ({
  bodies: [],
  floor: new Float32Array(Math.max(1, Math.ceil(width / COL))).fill(height),
  width,
  height,
  seed,
});

const cols = (floor: Float32Array, x0: number, x1: number) =>
  [
    Math.min(floor.length - 1, Math.max(0, Math.floor(x0 / COL))),
    Math.max(0, Math.min(floor.length - 1, Math.floor(x1 / COL))),
  ] as const;

const floorAt = (floor: Float32Array, x0: number, x1: number) => {
  const [a, b] = cols(floor, x0, x1);
  return Math.min(...floor.subarray(a, b + 1));
};

const settleOn = (floor: Float32Array, b: Body) => {
  const out = floor.slice();
  const [a, z] = cols(out, b.x, b.x + b.w);
  for (let c = a; c <= z; c++) out[c] = Math.min(out[c]!, b.y - b.h * 0.55);
  return out;
};

const merge = (gs: Glyph[], room: number): Glyph[] => {
  if (gs.length <= room) return gs;
  if (room <= 0) return [];
  const per = Math.ceil(gs.length / room);
  return Array.from({ length: Math.ceil(gs.length / per) }, (_, i) => {
    const part = gs.slice(i * per, i * per + per);
    const [first, last] = [part[0]!, part[part.length - 1]!];
    return {
      ...first,
      len: last.canon + last.len - first.canon,
      w: last.x + last.w - first.x,
    };
  });
};

export const detachBodies = (world: World, glyphs: Glyph[], reduced: boolean): World => {
  const rand = mulberry32(world.seed);
  let floor = world.floor;
  const added = merge(glyphs, MAX_BODIES - world.bodies.length).map((g, k): Body => {
    const [a, b, c] = [rand(), rand(), rand()];
    const body: Body = {
      ...g,
      y: g.y - g.h * 0.35,
      vx: (a - 0.5) * 3,
      vy: -(1.5 + b * 3),
      ang: 0,
      va: (c - 0.5) * 0.12,
      rest: false,
      delay: reduced ? 0 : k * 2,
    };
    if (!reduced) return body;
    const rested = {
      ...body,
      y: floorAt(floor, body.x, body.x + body.w) - body.h * 0.5,
      vx: 0,
      vy: 0,
      va: 0,
      rest: true,
      ang: (a - 0.5) * 0.9,
    };
    floor = settleOn(floor, rested);
    return rested;
  });
  return {
    ...world,
    floor,
    seed: (world.seed + added.length * 3) | 0,
    bodies: [...world.bodies, ...added],
  };
};

export const step = (world: World): World => {
  const rand = mulberry32(world.seed);
  let floor = world.floor;
  const bodies = world.bodies.map((o): Body => {
    if (o.rest) return o;
    if (o.delay > 0) return { ...o, delay: o.delay - 1 };
    const vy = o.vy + G;
    let [x, vx] = [o.x + o.vx, o.vx];
    if (x < 0) [x, vx] = [0, Math.abs(vx) * 0.5];
    if (x + o.w > world.width) [x, vx] = [world.width - o.w, -Math.abs(vx) * 0.5];
    const b = { ...o, x, vx, vy, y: o.y + vy, ang: o.ang + o.va };
    const f = floorAt(floor, b.x, b.x + b.w);
    if (b.y + b.h * 0.5 < f) return b;
    const landed = { ...b, y: f - b.h * 0.5 };
    if (Math.abs(landed.vy) >= 2.2)
      return { ...landed, vy: -landed.vy * 0.28, vx: landed.vx * 0.6 };
    const rested = {
      ...landed,
      vx: 0,
      vy: 0,
      va: 0,
      rest: true,
      ang: (rand() - 0.5) * 0.9,
    };
    floor = settleOn(floor, rested);
    return rested;
  });
  return { ...world, bodies, floor, seed: (world.seed + 1) | 0 };
};

export const removeBodies = (world: World, canons: Set<number>): World => {
  const bodies = world.bodies.filter((b) => !canons.has(b.canon));
  const floor = bodies
    .filter((b) => b.rest)
    .reduce(settleOn, new Float32Array(world.floor.length).fill(world.height));
  return { ...world, bodies, floor };
};
