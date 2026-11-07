import { CHECKPOINT_EVERY } from './scene';
import type { ReplayCtor, Scene } from './types';

export const withCheckpoints = (scene: Scene, Replay: ReplayCtor): Scene => {
  const r = new Replay(JSON.stringify({ ...scene, checkpoints: [] }));
  try {
    const end = r.end();
    const checkpoints: Scene['checkpoints'] = [];
    for (
      let step = CHECKPOINT_EVERY;
      step <= Math.max(end, CHECKPOINT_EVERY);
      step += CHECKPOINT_EVERY
    ) {
      r.run_to(step);
      checkpoints.push([step, r.hash(), Array.from(r.poses_q())]);
    }
    return { ...scene, checkpoints, cover_step: scene.cover_step || Math.floor(end / 2) };
  } finally {
    r.free();
  }
};
