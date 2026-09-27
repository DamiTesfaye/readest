import { describe, expect, it, vi } from 'vitest';
import type { Hlc } from '@/types/replica';
import { createMindmapClock } from '@/services/mindmap/file/clock';

describe('createMindmapClock', () => {
  it('delegates next and observe and exposes the device id', () => {
    const next = vi.fn(() => 'hlc-1' as Hlc);
    const observe = vi.fn();
    const clock = createMindmapClock({ next, observe }, 'device-1');
    expect(clock.deviceId).toBe('device-1');
    expect(clock.next()).toBe('hlc-1');
    clock.observe('hlc-2' as Hlc);
    expect(observe).toHaveBeenCalledWith('hlc-2');
  });
});
