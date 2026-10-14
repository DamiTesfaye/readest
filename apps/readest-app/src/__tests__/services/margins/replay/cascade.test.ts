import { describe, expect, it } from 'vitest';
import { type Level, runCascade } from '@/services/margins/replay/cascade';

describe('replay cascade', () => {
  it('each step is reached when the one above throws', async () => {
    const fail = () => Promise.reject(new Error('x'));
    const levels: Level[] = ['live', 'interpolated', 'still', 'cover', 'citation'];
    for (let ok = 0; ok < levels.length; ok++) {
      const out = await runCascade(
        levels.map(
          (l, i) => [l, i < ok ? fail : () => Promise.resolve(l)] as [Level, () => Promise<Level>],
        ),
      );
      expect(out.level).toBe(levels[ok]);
    }
  });

  it('throws when every step fails', async () => {
    await expect(
      runCascade([['citation', () => Promise.reject(new Error('x'))]]),
    ).rejects.toThrow();
  });
});
