import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useAtomValue, useMapRecords } from '@/app/reader/components/mindmap/useCanvasStores';
import { createAtom } from '@/services/mindmap/atom';
import { createNodeRecord } from '@/services/mindmap/records/defaults';
import { createMapStore } from '@/services/mindmap/store/mapStore';

describe('canvas store hooks', () => {
  it('returns the same records snapshot until the store changes', () => {
    const store = createMapStore([createNodeRecord({ id: 'a', index: 'a1' })]);
    let renders = 0;
    const { result, rerender } = renderHook(() => {
      renders += 1;
      return useMapRecords(store);
    });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
    expect(renders).toBe(2);
    act(() => {
      store.put([createNodeRecord({ id: 'b', index: 'a2' })]);
    });
    expect(result.current).not.toBe(first);
    expect(result.current.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('re-renders from an atom only when its value changes', () => {
    const atom = createAtom({ z: 1 });
    let renders = 0;
    const { result } = renderHook(() => {
      renders += 1;
      return useAtomValue(atom);
    });
    act(() => atom.set(atom.get()));
    expect(renders).toBe(1);
    act(() => atom.set({ z: 2 }));
    expect(result.current).toEqual({ z: 2 });
    expect(renders).toBe(2);
  });
});
