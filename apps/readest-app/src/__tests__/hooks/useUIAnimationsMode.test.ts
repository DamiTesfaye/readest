import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUIAnimationsMode } from '@/hooks/useUIAnimationsMode';

afterEach(() => {
  document.documentElement.removeAttribute('data-ui-anim');
});

describe('useUIAnimationsMode', () => {
  it('sets data-ui-anim="off" on the root when disabled', () => {
    const { result } = renderHook(() => useUIAnimationsMode());
    result.current.applyUIAnimationsMode(false);
    expect(document.documentElement.getAttribute('data-ui-anim')).toBe('off');
  });

  it('removes the attribute when enabled', () => {
    const { result } = renderHook(() => useUIAnimationsMode());
    result.current.applyUIAnimationsMode(false);
    result.current.applyUIAnimationsMode(true);
    expect(document.documentElement.hasAttribute('data-ui-anim')).toBe(false);
  });
});
