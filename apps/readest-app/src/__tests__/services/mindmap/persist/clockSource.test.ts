import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemoryHlcStore } from '@/libs/hlcStore';
import { __resetReplicaSyncForTests, initReplicaSync } from '@/services/sync/replicaSync';
import type { Hlc, ReplicaRow } from '@/types/replica';
import { __resetSettledEventsForTests } from '@/utils/event';
import {
  __resetMindmapClockForTests,
  getMindmapClock,
} from '@/services/mindmap/persist/clockSource';

const stubClient = () => ({
  push: vi.fn(async (rows: ReplicaRow[]) => rows),
  pull: vi.fn(async (_kind: string, _since: Hlc | null) => [] as ReplicaRow[]),
  pullBatch: vi.fn(async () => ({})),
});

afterEach(() => {
  __resetReplicaSyncForTests();
  __resetSettledEventsForTests();
  __resetMindmapClockForTests();
});

describe('getMindmapClock', () => {
  it('uses the shared replica-sync clock while replica sync runs', () => {
    const ctx = initReplicaSync({
      deviceId: 'device-1',
      cursorStore: { get: () => null, set: () => {} },
      hlcStore: new InMemoryHlcStore(),
      client: stubClient() as never,
    });
    const clock = getMindmapClock('device-1');
    const before = ctx.hlc.serialize();
    clock.next();
    expect(clock.deviceId).toBe('device-1');
    expect(ctx.hlc.serialize()).not.toEqual(before);
  });

  it('falls back to a persisted local generator that stays monotonic across restarts', () => {
    const store = new InMemoryHlcStore();
    const first = getMindmapClock('device-2', store).next();
    __resetMindmapClockForTests();
    const second = getMindmapClock('device-2', store).next();
    expect(first < second).toBe(true);
    expect(store.load()).not.toBeNull();
  });
});
