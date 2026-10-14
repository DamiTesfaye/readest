import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ReplayCtor } from '@/services/margins/replay/engine';

const vendor = join(process.cwd(), 'public/vendor/margin-play');
const scene = readFileSync(
  join(process.cwd(), 'src/__tests__/fixtures/margins/scene-meditations.json'),
  'utf8',
);

const replayCtor = async (): Promise<ReplayCtor> => {
  const glue = await import(
    /* @vite-ignore */ `${pathToFileURL(join(vendor, 'margin_play_wasm.js')).href}?i=replay`
  );
  glue.initSync({ module: readFileSync(join(vendor, 'margin_play_wasm_bg.wasm')) });
  return glue.Replay as ReplayCtor;
};

describe('replay engine', () => {
  it('the vendored wasm reproduces the golden hashes', async () => {
    const Replay = await replayCtor();
    const r = new Replay(scene);
    for (const [step, hash, poses] of JSON.parse(scene).checkpoints as [
      number,
      number,
      number[],
    ][]) {
      r.run_to(step);
      expect(r.hash()).toBe(hash);
      expect(Array.from(r.poses_q())).toEqual(poses);
    }
    r.free();
  });

  it('refuses a scene with a string field', async () => {
    const Replay = await replayCtor();
    expect(() => new Replay(JSON.stringify({ ...JSON.parse(scene), title: 'x' }))).toThrow();
  });
});
