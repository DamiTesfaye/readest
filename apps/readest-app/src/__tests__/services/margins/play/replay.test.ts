import { describe, expect, it } from 'vitest';
import type { PlayElement } from '@/services/margins/play/element';
import { posesToPage, replayPlan } from '@/services/margins/play/replay';

const canonical = new TextEncoder().encode('Begin the morning by saying');
const element: PlayElement = {
  id: 'p1',
  kind: 'play',
  frame: { x: 0.5, y: 0.5, w: 0.6, r: 0 },
  contract: 'displace',
  alt: 'a',
  shapes: [{ id: 's1', type: 'circle', r: 3, pad: 0 }],
  poses: [{ shape: 's1', x: 1, y: 1, rot: 0 }],
  detach: { unit: 'word', spans: [[6, 9]], sink: 'floor', seed: 1 },
};
const placed = (step: 1 | 2 | 3 | null) => ({
  range: null,
  sectionIndex: step === null ? null : 0,
  step,
  confidence: 1,
});

describe('replay', () => {
  it('plays everything at steps 1 and 2', () => {
    expect(replayPlan({ element, placement: placed(1), canonical, anchorStart: 0 })).toEqual({
      shapes: true,
      spans: [[6, 9]],
    });
  });

  it('step3_replays_displace_only', () => {
    expect(replayPlan({ element, placement: placed(3), canonical, anchorStart: 0 })).toEqual({
      shapes: true,
      spans: [],
    });
  });

  it('never plays detached or other-version results', () => {
    expect(replayPlan({ element, placement: placed(null), canonical, anchorStart: 0 })).toBeNull();
  });

  it('poses shapes in ems from the anchor origin', () => {
    expect(posesToPage(element, { x: 10, y: 20 }, 16)).toEqual([
      { shape: 's1', x: 26, y: 36, rot: 0 },
    ]);
  });
});
