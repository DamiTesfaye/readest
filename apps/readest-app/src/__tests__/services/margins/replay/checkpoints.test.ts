import { describe, expect, it } from 'vitest';
import { withCheckpoints } from '@/services/margins/replay/checkpoints';
import type { Scene } from '@/services/margins/replay/types';
import { goldenScene, replayCtor } from './nodeReplay';

const golden = JSON.parse(goldenScene) as Scene;

describe('checkpoints', () => {
  it('recomputes the golden checkpoints by replaying the scene', async () => {
    const out = withCheckpoints({ ...golden, checkpoints: [] }, await replayCtor());
    expect(out.checkpoints).toEqual(golden.checkpoints);
    expect(out.cover_step).toBe(golden.cover_step);
  });

  it('gives a scene with no events one checkpoint and keeps cover step 0', async () => {
    const out = withCheckpoints(
      { ...golden, events: [], checkpoints: [], cover_step: 0 },
      await replayCtor(),
    );
    expect(out.checkpoints.map(([step]) => step)).toEqual([600]);
    expect(out.cover_step).toBe(0);
  });

  it('defaults the cover step to half the recording', async () => {
    const out = withCheckpoints({ ...golden, checkpoints: [], cover_step: 0 }, await replayCtor());
    expect(out.cover_step).toBe(2400);
  });
});
