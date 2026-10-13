import { describe, expect, it, vi } from 'vitest';
import { playTools } from '@/services/margins/play/tools';
import type { PlayTools, PlayToolsState } from '@/services/margins/play/session';

describe('play tools', () => {
  it('registers namespaced ids in display order and calls PlayTools', async () => {
    const tools = playTools((k) => k);
    expect(tools.map((t) => t.id)).toEqual([
      'play.circle',
      'play.polygon',
      'play.drift',
      'play.detach',
      'play.detachNext',
      'play.shake',
      'play.undo',
      'play.keep',
      'play.exit',
    ]);
    const undo = vi.fn();
    const state = { active: true, canUndo: true } as PlayToolsState;
    const u = tools.find((t) => t.id === 'play.undo')!;
    expect(u.enabled(state)).toBe(true);
    await u.run({ undo, state } as unknown as PlayTools);
    expect(undo).toHaveBeenCalled();
  });
});
