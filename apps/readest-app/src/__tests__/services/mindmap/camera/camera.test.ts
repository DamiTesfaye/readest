import { describe, expect, it } from 'vitest';
import { MAX_ZOOM, MIN_ZOOM, animateCamera, createCamera } from '@/services/mindmap/camera/camera';

describe('camera', () => {
  it('converts between screen and page space', () => {
    const camera = createCamera({ x: 100, y: 50, z: 2 });
    expect(camera.screenToPage({ x: 300, y: 250 })).toEqual({ x: 100, y: 100 });
    expect(camera.pageToScreen({ x: 100, y: 100 })).toEqual({ x: 300, y: 250 });
  });

  it('keeps the page point under the cursor fixed across repeated zooms', () => {
    const camera = createCamera({ x: 13, y: -40, z: 1 });
    const cursor = { x: 420, y: 310 };
    const before = camera.screenToPage(cursor);
    camera.zoomAt(cursor, 1.25);
    camera.zoomAt(cursor, 1.25);
    camera.zoomAt(cursor, 0.7);
    const after = camera.screenToPage(cursor);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('clamps zoom to the allowed range', () => {
    const camera = createCamera({ x: 0, y: 0, z: 1 });
    camera.zoomAt({ x: 0, y: 0 }, 1000);
    expect(camera.get().z).toBe(MAX_ZOOM);
    camera.zoomAt({ x: 0, y: 0 }, 0.00001);
    expect(camera.get().z).toBe(MIN_ZOOM);
  });

  it('pans in screen pixels', () => {
    const camera = createCamera({ x: 0, y: 0, z: 2 });
    camera.panBy(10, -5);
    expect(camera.get()).toEqual({ x: 10, y: -5, z: 2 });
  });

  it('reports the page rectangle the viewport shows', () => {
    const camera = createCamera({ x: -200, y: -100, z: 2 });
    expect(camera.viewportBounds({ width: 800, height: 600 })).toEqual({
      x: 100,
      y: 50,
      w: 400,
      h: 300,
    });
  });

  it('fits bounds inside the viewport without zooming past 1', () => {
    const camera = createCamera({ x: 0, y: 0, z: 1 });
    const target = camera.fitTarget({ x: 0, y: 0, w: 2000, h: 500 }, { width: 1096, height: 800 });
    expect(target.z).toBeCloseTo(0.5, 9);
    camera.set(target);
    const center = camera.screenToPage({ x: 548, y: 400 });
    expect(center.x).toBeCloseTo(1000, 9);
    expect(center.y).toBeCloseTo(250, 9);
    expect(camera.fitTarget({ x: 0, y: 0, w: 10, h: 10 }, { width: 800, height: 600 }).z).toBe(1);
  });

  it('centres the origin when there is nothing to fit', () => {
    const camera = createCamera({ x: 0, y: 0, z: 3 });
    expect(camera.fitTarget(null, { width: 800, height: 600 })).toEqual({ x: 400, y: 300, z: 1 });
  });

  it('jumps without animation and eases to the target with it', () => {
    const camera = createCamera({ x: 0, y: 0, z: 1 });
    animateCamera(camera, { x: 100, y: 0, z: 1 }, false);
    expect(camera.get().x).toBe(100);
    let time = 0;
    const frames: Array<() => void> = [];
    animateCamera(
      camera,
      { x: 300, y: 0, z: 1 },
      true,
      () => time,
      (callback) => frames.push(callback),
    );
    time = 100;
    frames.shift()!();
    expect(camera.get().x).toBeGreaterThan(100);
    expect(camera.get().x).toBeLessThan(300);
    time = 250;
    frames.shift()!();
    expect(camera.get().x).toBe(300);
    expect(frames).toHaveLength(0);
  });
});
