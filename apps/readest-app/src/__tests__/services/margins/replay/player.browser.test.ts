import { describe, expect, it } from 'vitest';
import { loadReplay } from '@/services/margins/replay/engine';
import { createPlayer } from '@/services/margins/replay/player';
import type { Scene } from '@/services/margins/replay/types';
import golden from '../../../fixtures/margins/scene-meditations.json';

const ON_CI = Boolean(process.env['CI']);
const FRAMES = 240;

describe('replay player in the browser', () => {
  it('draws the golden scene on a 1080x1920 canvas within the frame budget', async () => {
    const Replay = await loadReplay();
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    document.body.appendChild(canvas);
    let now = 0;
    let cb: FrameRequestCallback | null = null;
    const player = createPlayer({
      canvas,
      scene: golden as unknown as Scene,
      Replay,
      material: { kind: 'ghost' },
      color: '#222',
      font: 'serif',
      clock: () => now,
      raf: (f) => {
        cb = f;
        return 1;
      },
      caf: () => {
        cb = null;
      },
    });
    player.start();
    const times: number[] = [];
    for (let i = 0; i < FRAMES; i++) {
      now += 1000 / 60;
      const f = cb as FrameRequestCallback | null;
      cb = null;
      const t0 = performance.now();
      f?.(now);
      times.push(performance.now() - t0);
    }
    player.destroy();
    canvas.remove();
    const mean = times.reduce((n, t) => n + t, 0) / times.length;
    console.info(`replay mean frame ${mean.toFixed(2)} ms`);
    expect(player.drifts).toBe(0);
    expect(mean).toBeLessThanOrEqual(ON_CI ? 8 : 4);
  });
});
