import { describe, expect, it } from 'vitest';
import { nearestInDirection } from '@/services/mindmap/spatial/nearestInDirection';

const at = (id: string, x: number, y: number) => ({ id, center: { x, y } });

describe('nearestInDirection', () => {
  it('only considers candidates ahead in the direction', () => {
    const candidates = [
      at('left', -100, 0),
      at('right', 100, 0),
      at('up', 0, -100),
      at('down', 0, 100),
    ];
    expect(nearestInDirection({ x: 0, y: 0 }, candidates, 'right')).toBe('right');
    expect(nearestInDirection({ x: 0, y: 0 }, candidates, 'left')).toBe('left');
    expect(nearestInDirection({ x: 0, y: 0 }, candidates, 'up')).toBe('up');
    expect(nearestInDirection({ x: 0, y: 0 }, candidates, 'down')).toBe('down');
  });

  it('prefers a candidate in line over a closer one off to the side', () => {
    const candidates = [at('diagonal', 80, 70), at('inline', 200, 0)];
    expect(nearestInDirection({ x: 0, y: 0 }, candidates, 'right')).toBe('inline');
  });

  it('returns null when nothing lies ahead', () => {
    expect(nearestInDirection({ x: 0, y: 0 }, [at('behind', -10, 0)], 'right')).toBeNull();
  });
});
