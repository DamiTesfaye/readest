/**
 * One-time Rive runtime configuration. The `@rive-app/canvas` runtime fetches
 * its WASM from a CDN by default, which breaks in the offline Tauri shell and
 * adds a network round-trip on the web. We vendor the WASM under
 * `public/rive/` (see `public/rive/rive.wasm`) and point the loader at it so
 * the viewer works fully offline on web and desktop.
 */
import { RuntimeLoader } from '@rive-app/canvas';

let configured = false;

export function configureRiveRuntime(): void {
  if (configured) return;
  configured = true;
  RuntimeLoader.setWasmUrl('/rive/rive.wasm');
  RuntimeLoader.setWasmFallbackUrl('/rive/rive_fallback.wasm');
}
