import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ReplayCtor } from '@/services/margins/replay/engine';

const vendor = join(process.cwd(), 'public/vendor/margin-play');

export const goldenScene = readFileSync(
  join(process.cwd(), 'src/__tests__/fixtures/margins/scene-meditations.json'),
  'utf8',
);

export const replayCtor = async (): Promise<ReplayCtor> => {
  const glue = await import(
    /* @vite-ignore */ `${pathToFileURL(join(vendor, 'margin_play_wasm.js')).href}?i=replay`
  );
  glue.initSync({ module: readFileSync(join(vendor, 'margin_play_wasm_bg.wasm')) });
  return glue.Replay as ReplayCtor;
};
