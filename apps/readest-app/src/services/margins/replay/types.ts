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
