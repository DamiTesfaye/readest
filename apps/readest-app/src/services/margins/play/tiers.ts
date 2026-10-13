export type Tier = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';

const ORDER: Tier[] = ['P1', 'P2', 'P3', 'P4'];
const WINDOW = 60;
const SLOW_MS = 33;

export const createTierMonitor = () => {
  let frames: number[] = [];
  const m = {
    tier: 'P1' as Tier,
    record(frameMs: number): Tier {
      frames = [...frames.slice(-(WINDOW - 1)), frameMs];
      if (frames.length < WINDOW || m.tier === 'P4' || m.tier === 'P5') return m.tier;
      const p95 = [...frames].sort((a, b) => a - b)[Math.floor(WINDOW * 0.95)]!;
      if (p95 > SLOW_MS) {
        m.tier = ORDER[ORDER.indexOf(m.tier) + 1]!;
        frames = [];
      }
      return m.tier;
    },
  };
  return m;
};
