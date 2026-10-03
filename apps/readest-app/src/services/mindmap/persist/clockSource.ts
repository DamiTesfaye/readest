import { HlcGenerator } from '@/libs/crdt';
import { type HlcSnapshotStore, LocalStorageHlcStore } from '@/libs/hlcStore';
import { getReplicaSync } from '@/services/sync/replicaSync';
import { type HlcClock, createMindmapClock } from '@/services/mindmap/file/clock';

let fallback: { hlc: HlcGenerator; deviceId: string } | null = null;

export const getMindmapClock = (
  deviceId: string,
  hlcStore: HlcSnapshotStore = new LocalStorageHlcStore(),
): HlcClock => {
  const synced = getReplicaSync();
  if (synced) return createMindmapClock(synced.hlc, synced.deviceId);

  if (!fallback || fallback.deviceId !== deviceId) {
    const snapshot = hlcStore.load();
    const hlc = snapshot ? HlcGenerator.restore(snapshot, deviceId) : new HlcGenerator(deviceId);
    fallback = { hlc, deviceId };
  }
  const { hlc } = fallback;
  return createMindmapClock(
    {
      next: () => {
        const value = hlc.next();
        hlcStore.save(hlc.serialize());
        return value;
      },
      observe: (remote) => {
        hlc.observe(remote);
        hlcStore.save(hlc.serialize());
      },
    },
    deviceId,
  );
};

export const __resetMindmapClockForTests = (): void => {
  fallback = null;
};
