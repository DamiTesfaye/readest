import type { ReplayCtor } from './types';

export type { ReplayCtor, ReplayHandle } from './types';
export const BOX_STRIDE = 5;
const VENDOR = '/vendor/margin-play';
let shared: Promise<ReplayCtor> | null = null;

export const loadReplay = (): Promise<ReplayCtor> =>
  (shared ??= (async () => {
    const module = await WebAssembly.compileStreaming(fetch(`${VENDOR}/margin_play_wasm_bg.wasm`));
    const url = new URL(`${VENDOR}/margin_play_wasm.js?i=replay`, location.href).href;
    const glue = await import(
      /* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ url
    );
    await glue.default({ module_or_path: module });
    return glue.Replay as ReplayCtor;
  })().catch((error: unknown) => {
    shared = null;
    throw error;
  }));
