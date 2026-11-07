import { createDrawer } from './player';
import type { ReplayCtor, Scene } from './types';

const COVER_MAX_W = 1080;
const COVER_MAX_H = 1920;
const COVER_QUALITY = 0.85;

export const renderCover = async (a: {
  scene: Scene;
  Replay: ReplayCtor;
  step: number;
  width?: number;
  height?: number;
  color: string;
  ground: string;
}): Promise<Blob> => {
  const width = Math.min(a.width ?? COVER_MAX_W, COVER_MAX_W);
  const height = Math.min(a.height ?? COVER_MAX_H, COVER_MAX_H);
  const frame = new OffscreenCanvas(width, height);
  const replay = new a.Replay(JSON.stringify(a.scene));
  try {
    replay.run_to(a.step);
    createDrawer({
      canvas: frame as unknown as HTMLCanvasElement,
      scene: a.scene,
      material: { kind: 'ghost' },
      color: a.color,
      font: 'serif',
    })(replay);
  } finally {
    replay.free();
  }
  const cover = new OffscreenCanvas(width, height);
  const g = cover.getContext('2d')!;
  g.fillStyle = a.ground;
  g.fillRect(0, 0, width, height);
  g.drawImage(frame, 0, 0);
  return cover.convertToBlob({ type: 'image/jpeg', quality: COVER_QUALITY });
};
