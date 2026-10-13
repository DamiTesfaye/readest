export const FONT_BUDGET = 32 * 1024 * 1024;
export const FACE_MAX = 16 * 1024 * 1024;

export interface PlayGlue {
  add_font(bytes: Uint8Array): string;
  covers(family: string, text: string): boolean;
  set_page(json: string): void;
  set_shapes(json: string): void;
  set_poses(flat: Float32Array): void;
  set_removed(flat: Uint32Array): void;
  compose(): boolean;
  glyphs(): Float32Array;
  lines(): Float32Array;
  overset_at(): number;
  hit(x: number, y: number): number;
  outline(face: number, gid: number): string;
}

export interface PlayEngine {
  readonly glue: PlayGlue;
  readonly fontBytes: number;
  addFont(key: string, bytes: Uint8Array): Promise<string>;
}

export const createPlayEngine = (load: (instance: number) => Promise<PlayGlue>): PlayEngine => {
  let instance = 0;
  let glue: PlayGlue | null = null;
  let loaded = new Map<string, { size: number; family: string }>();
  const total = () => [...loaded.values()].reduce((n, f) => n + f.size, 0);
  return {
    get glue() {
      if (!glue) throw new Error('play engine not loaded');
      return glue;
    },
    get fontBytes() {
      return total();
    },
    async addFont(key, bytes) {
      if (bytes.length > FACE_MAX) throw new Error('face over 16 MB');
      const known = loaded.get(key);
      if (known) return known.family;
      if (total() + bytes.length > FONT_BUDGET) {
        instance++;
        glue = null;
        loaded = new Map();
      }
      glue ??= await load(instance);
      const family = glue.add_font(bytes);
      loaded.set(key, { size: bytes.length, family });
      return family;
    },
  };
};

const VENDOR = '/vendor/margin-play';
let shared: Promise<PlayEngine> | null = null;

export const loadPlayEngine = (): Promise<PlayEngine> =>
  (shared ??= (async () => {
    const module = await WebAssembly.compileStreaming(fetch(`${VENDOR}/margin_play_wasm_bg.wasm`));
    return createPlayEngine(async (i) => {
      const url = new URL(`${VENDOR}/margin_play_wasm.js?i=${i}`, location.href).href;
      const glue = await import(
        /* webpackIgnore: true */ /* turbopackIgnore: true */ /* @vite-ignore */ url
      );
      await glue.default({ module_or_path: module });
      return glue as PlayGlue;
    });
  })().catch((error: unknown) => {
    shared = null;
    throw error;
  }));
