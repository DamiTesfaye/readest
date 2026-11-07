/* tslint:disable */
/* eslint-disable */

export class Replay {
    free(): void;
    [Symbol.dispose](): void;
    boxes(): Float32Array;
    end(): number;
    hash(): number;
    constructor(scene_json: string);
    now(): number;
    poses_q(): Int32Array;
    push(kind: number, args: Float64Array): boolean;
    run_to(step: number): void;
    shape_rev(): number;
    shapes_json(): string;
    snap(q: Int32Array): boolean;
    step(n: number): number;
    take_sounds(): Uint32Array;
}

export function add_font(bytes: Uint8Array): string;

export function compose(): boolean;

export function covers(family: string, text: string): boolean;

export function glyphs(): Float32Array;

export function hit(x: number, y: number): number;

export function lines(): Float32Array;

export function outline(face: number, gid: number): string;

export function overset_at(): number;

export function set_page(json: string): void;

export function set_poses(flat: Float32Array): void;

export function set_removed(flat: Uint32Array): void;

export function set_shapes(json: string): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_replay_free: (a: number, b: number) => void;
    readonly add_font: (a: number, b: number) => [number, number, number, number];
    readonly compose: () => [number, number, number];
    readonly covers: (a: number, b: number, c: number, d: number) => number;
    readonly glyphs: () => [number, number];
    readonly hit: (a: number, b: number) => number;
    readonly lines: () => [number, number];
    readonly outline: (a: number, b: number) => [number, number];
    readonly overset_at: () => number;
    readonly replay_boxes: (a: number) => [number, number];
    readonly replay_end: (a: number) => number;
    readonly replay_hash: (a: number) => number;
    readonly replay_new: (a: number, b: number) => [number, number, number];
    readonly replay_now: (a: number) => number;
    readonly replay_poses_q: (a: number) => [number, number];
    readonly replay_push: (a: number, b: number, c: number, d: number) => number;
    readonly replay_run_to: (a: number, b: number) => void;
    readonly replay_shape_rev: (a: number) => number;
    readonly replay_shapes_json: (a: number) => [number, number];
    readonly replay_snap: (a: number, b: number, c: number) => number;
    readonly replay_step: (a: number, b: number) => number;
    readonly replay_take_sounds: (a: number) => [number, number];
    readonly set_page: (a: number, b: number) => [number, number];
    readonly set_poses: (a: number, b: number) => void;
    readonly set_removed: (a: number, b: number) => [number, number];
    readonly set_shapes: (a: number, b: number) => [number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
