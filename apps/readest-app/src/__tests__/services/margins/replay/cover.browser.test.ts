import { describe, expect, it, vi } from 'vitest';
import { loadReplay } from '@/services/margins/replay/engine';
import { renderCover } from '@/services/margins/replay/cover';
import type { Scene } from '@/services/margins/replay/types';
import golden from '../../../fixtures/margins/scene-meditations.json';

describe('cover frames', () => {
  it('renders a cover frame with no text', async () => {
    const spies = [
      vi.spyOn(OffscreenCanvasRenderingContext2D.prototype, 'fillText'),
      vi.spyOn(CanvasRenderingContext2D.prototype, 'fillText'),
    ];
    try {
      const scene = golden as unknown as Scene;
      const jpeg = await renderCover({
        scene,
        Replay: await loadReplay(),
        step: scene.cover_step,
        width: 1600,
        height: 2400,
        color: '#222222',
        ground: '#f4efe6',
      });
      expect(jpeg.type).toBe('image/jpeg');
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      const bitmap = await createImageBitmap(jpeg);
      expect(bitmap.width).toBeLessThanOrEqual(1080);
      expect(bitmap.height).toBeLessThanOrEqual(1920);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const g = canvas.getContext('2d')!;
      g.drawImage(bitmap, 0, 0);
      const { data } = g.getImageData(0, 0, bitmap.width, bitmap.height);
      const dark = data.filter((_, i) => i % 4 === 0 && data[i]! < 128).length;
      expect(dark).toBeGreaterThan(0);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});
