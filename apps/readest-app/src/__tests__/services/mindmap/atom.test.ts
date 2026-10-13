import { describe, expect, it, vi } from 'vitest';
import { createAtom } from '@/services/mindmap/atom';

describe('createAtom', () => {
  it('returns the same snapshot until the value changes', () => {
    const atom = createAtom({ a: 1 });
    expect(atom.get()).toBe(atom.get());
  });

  it('notifies listeners on change and skips identical values', () => {
    const value = { a: 1 };
    const atom = createAtom(value);
    const listener = vi.fn();
    const unsubscribe = atom.subscribe(listener);
    atom.set(value);
    expect(listener).not.toHaveBeenCalled();
    atom.set({ a: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    atom.set({ a: 3 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
