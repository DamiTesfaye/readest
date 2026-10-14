export interface ReplayHandle {
  step(n: number): number;
  run_to(step: number): void;
  now(): number;
  end(): number;
  hash(): number;
  poses_q(): Int32Array;
  snap(q: Int32Array): boolean;
  boxes(): Float32Array;
  shapes_json(): string;
  shape_rev(): number;
  push(kind: number, args: Float64Array): boolean;
  take_sounds(): Uint32Array;
  free(): void;
}

export type ReplayCtor = new (sceneJson: string) => ReplayHandle;

export interface Scene {
  v: 1;
  page: { w: number; h: number; columns: number; gutter: number; font: string; size: number };
  lines: { y: number; base: number; boxes: [number, number, number][] }[];
  glyphs?: [number, number, number, number][];
  passage: { start: number; end: number; boxes: [number, number] };
  seed: number;
  step_hz: 120;
  events: number[][];
  checkpoints: [number, number, number[]][];
  sfx: [number, string][];
  cover_step: number;
}
