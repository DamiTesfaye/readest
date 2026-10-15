import { describe, expect, it } from 'vitest';
import { goldenScene as scene, replayCtor } from './nodeReplay';

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
