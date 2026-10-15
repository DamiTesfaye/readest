import { BOX_STRIDE } from './engine';
import { drawUnits, type Material, passageUnits, unitsOf } from './material';
import { EV, STEP_HZ, TOOL } from './scene';
import type { ReplayCtor, ReplayHandle, Scene } from './types';

export interface Player {
  start(): void;
  pause(): void;
  restart(): void;
  destroy(): void;
  pointer(kind: 'down' | 'move' | 'up', xPx: number, yPx: number): void;
  readonly ended: boolean;
  readonly drifts: number;
  readonly mode: 'live' | 'interpolated';
}

export interface PlayerArgs {
  canvas: HTMLCanvasElement;
  scene: Scene;
  Replay: ReplayCtor;
  material: Material;
  color: string;
  font: string;
  reduced?: boolean;
  mode?: 'live' | 'interpolated';
  clock?: () => number;
  raf?: (cb: FrameRequestCallback) => number;
  caf?: (id: number) => void;
  onDrift?(step: number): void;
  onSound?(step: number, code: number, now: number): void;
  onEnd?(): void;
  onTurn?(): void;
  onRestart?(): void;
}

type ShapeJson =
  | { type: 'circle'; r: number; x: number; y: number }
  | { type: 'polygon'; pts: [number, number][]; x: number; y: number; rot: number };

const MAX_STEPS_PER_FRAME = 12;
const IDLE_RESTART_MS = 3000;

export const sceneSfxCode = (index: number) => -1 - index;

const viewOf = (canvas: HTMLCanvasElement, scene: Scene) => {
  const em = Math.min(canvas.width / scene.page.w, canvas.height / scene.page.h);
  return {
    em,
    x: (canvas.width - scene.page.w * em) / 2,
    y: (canvas.height - scene.page.h * em) / 2,
  };
};

const shapePath = (s: ShapeJson, em: number) => {
  const path = new Path2D();
  if (s.type === 'circle') {
    path.arc(s.x * em, s.y * em, s.r * em, 0, Math.PI * 2);
    return path;
  }
  s.pts.forEach(([x, y], i) => {
    if (i === 0) path.moveTo((s.x + x) * em, (s.y + y) * em);
    else path.lineTo((s.x + x) * em, (s.y + y) * em);
  });
  path.closePath();
  return path;
};

export const createDrawer = (
  a: Pick<PlayerArgs, 'canvas' | 'scene' | 'material' | 'color' | 'font'>,
) => {
  const g = a.canvas.getContext('2d');
  const units = unitsOf(a.scene);
  const passage = passageUnits(a.scene);
  let rev = -1;
  let shapes: ShapeJson[] = [];
  return (replay: ReplayHandle) => {
    if (!g) return;
    const view = viewOf(a.canvas, a.scene);
    if (replay.shape_rev() !== rev) {
      rev = replay.shape_rev();
      shapes = JSON.parse(replay.shapes_json()) as ShapeJson[];
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, a.canvas.width, a.canvas.height);
    g.translate(view.x, view.y);
    drawUnits(g, {
      boxes: replay.boxes(),
      units,
      material: a.material,
      passage,
      seed: a.scene.seed,
      em: view.em,
      color: a.color,
      font: a.font,
    });
    g.fillStyle = a.color;
    g.globalAlpha = 0.3;
    for (const s of shapes) g.fill(shapePath(s, view.em));
    g.globalAlpha = 1;
  };
};

export const drawStill = (a: Omit<PlayerArgs, 'clock' | 'raf' | 'caf'>): void => {
  const replay = new a.Replay(JSON.stringify(a.scene));
  try {
    replay.run_to(replay.end());
    createDrawer(a)(replay);
  } finally {
    replay.free();
  }
};

export const createPlayer = (a: PlayerArgs): Player => {
  const clock = a.clock ?? (() => performance.now());
  const raf = a.raf ?? ((cb: FrameRequestCallback) => requestAnimationFrame(cb));
  const caf = a.caf ?? ((id: number) => cancelAnimationFrame(id));
  const draw = createDrawer(a);
  const expected = new Map(a.scene.checkpoints.map((c) => [c[0], c]));
  const checkpointSteps = [...expected.keys()].sort((x, y) => x - y);
  const units = unitsOf(a.scene);
  let replay = new a.Replay(JSON.stringify(a.scene));
  let end = replay.end();
  let origin = clock();
  let pausedAt: number | null = origin;
  let frame = 0;
  let ended = false;
  let endedAt = 0;
  let lastInput = 0;
  let turned = false;
  let drifts = 0;
  let mode: 'live' | 'interpolated' = a.mode ?? 'live';
  let sfxNext = 0;

  const nextCheckpoint = (now: number) =>
    ended ? Infinity : (checkpointSteps.find((s) => s > now) ?? Infinity);

  const check = (step: number) => {
    const c = expected.get(step);
    if (!c || replay.hash() === c[1]) return;
    replay.snap(Int32Array.from(c[2]));
    drifts += 1;
    a.onDrift?.(step);
    if (drifts >= 2) mode = 'interpolated';
  };

  const interpolate = (step: number) => {
    const cps = a.scene.checkpoints;
    const after = cps.findIndex((c) => c[0] > step);
    const before = cps[(after < 0 ? cps.length : after) - 1];
    if (!before) return;
    const next = after < 0 ? null : cps[after]!;
    const k = next ? (step - before[0]) / (next[0] - before[0]) : 0;
    const q =
      next && next[2].length === before[2].length
        ? before[2].map((v, i) => Math.round(v + (next[2][i]! - v) * k))
        : before[2];
    replay.snap(Int32Array.from(q));
  };

  const finish = (now: number) => {
    if (ended) return;
    ended = true;
    endedAt = now;
    a.onEnd?.();
  };

  const emitSounds = () => {
    const sounds = replay.take_sounds();
    const now = replay.now();
    for (let i = 0; i + 1 < sounds.length; i += 2) a.onSound?.(sounds[i]!, sounds[i + 1]!, now);
    while (sfxNext < a.scene.sfx.length && a.scene.sfx[sfxNext]![0] <= now + 1) {
      a.onSound?.(a.scene.sfx[sfxNext]![0], sceneSfxCode(sfxNext), now);
      sfxNext++;
    }
  };

  const advance = (target: number) => {
    let taken = 0;
    while (replay.now() < target && taken < MAX_STEPS_PER_FRAME) {
      const now = replay.now();
      const n = Math.min(target - now, MAX_STEPS_PER_FRAME - taken, nextCheckpoint(now) - now);
      replay.step(n);
      taken += n;
      if (!ended) check(replay.now());
      if (mode === 'interpolated') return;
      if (replay.now() >= end) finish(clock());
    }
  };

  const tick = () => {
    frame = 0;
    if (pausedAt !== null) return;
    const now = clock();
    const target = Math.floor(((now - origin) * STEP_HZ) / 1000);
    if (mode === 'interpolated') {
      interpolate(target);
      if (target >= end) finish(now);
    } else advance(target);
    emitSounds();
    if (ended && !a.reduced && now - Math.max(endedAt, lastInput) > IDLE_RESTART_MS) {
      restart();
      return;
    }
    draw(replay);
    frame = raf(tick);
  };

  const start = () => {
    if (pausedAt === null) return;
    origin += clock() - pausedAt;
    pausedAt = null;
    frame = raf(tick);
  };

  const pause = () => {
    if (pausedAt !== null) return;
    pausedAt = clock();
    if (frame) caf(frame);
    frame = 0;
  };

  const restart = () => {
    replay.free();
    replay = new a.Replay(JSON.stringify(a.scene));
    end = replay.end();
    origin = clock();
    if (pausedAt !== null) pausedAt = origin;
    ended = false;
    turned = false;
    drifts = 0;
    mode = a.mode ?? 'live';
    sfxNext = 0;
    if (pausedAt === null && !frame) frame = raf(tick);
    a.onRestart?.();
  };

  const hitUnit = (x: number, y: number) => {
    const boxes = replay.boxes();
    return units.findIndex((u, i) => {
      const o = i * BOX_STRIDE;
      const left = boxes[o]!;
      const top = boxes[o + 1]! - u.asc;
      return (
        (boxes[o + 4]! & 1) === 1 && x >= left && x <= left + u.w && y >= top && y <= top + u.h
      );
    });
  };

  const pointer = (kind: 'down' | 'move' | 'up', xPx: number, yPx: number) => {
    if (!ended) return;
    const view = viewOf(a.canvas, a.scene);
    const [x, y] = [(xPx - view.x) / view.em, (yPx - view.y) / view.em];
    const hit = kind === 'down' && replay.shapes_json() === '[]' ? hitUnit(x, y) : -1;
    if (hit >= 0) replay.push(EV.TOOL, Float64Array.from([TOOL.DETACH, hit, hit + 1]));
    else if (kind === 'up') replay.push(EV.UP, new Float64Array(0));
    else replay.push(kind === 'down' ? EV.DOWN : EV.MOVE, Float64Array.from([x, y]));
    lastInput = clock();
    if (!turned) {
      turned = true;
      a.onTurn?.();
    }
  };

  return {
    start,
    pause,
    restart,
    destroy() {
      pause();
      replay.free();
    },
    pointer,
    get ended() {
      return ended;
    },
    get drifts() {
      return drifts;
    },
    get mode() {
      return mode;
    },
  };
};
