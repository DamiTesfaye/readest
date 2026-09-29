import environmentConfig from '@/services/environment';
import { getMindmapClock } from '@/services/mindmap/persist/clockSource';
import { MINDMAP_BASE_DIR } from '@/services/mindmap/persist/mapFile';
import { type MindmapFs, mindmapFsFromAppService } from '@/services/mindmap/persist/mindmapFs';
import { useMindmapStore } from '@/services/mindmap/persist/mindmapStore';
import {
  type TrashedMap,
  listTrashedMaps,
  sweepTrashedMaps,
} from '@/services/mindmap/persist/mindmapTrash';
import {
  type MergeOutcome,
  type MindmapMergeDeps,
  mergeIncomingVersion,
} from '@/services/mindmap/sync/merge';
import { type MindmapPusher, createMindmapPusher } from '@/services/mindmap/sync/push';
import { incomingDir } from '@/services/mindmap/sync/versions';
import { MINDMAP_KIND } from '@/services/sync/adapters/mindmap';
import { queueReplicaBinaryUpload } from '@/services/sync/replicaBinaryUpload';
import { publishReplicaUpsert } from '@/services/sync/replicaPublish';
import { isSyncCategoryEnabled } from '@/services/sync/syncCategories';
import { transferManager } from '@/services/transferManager';
import { useSettingsStore } from '@/store/settingsStore';
import { type ReplicaTransferFile, useTransferStore } from '@/store/transferStore';
import type { AppService } from '@/types/system';
import { getAccessToken } from '@/utils/access';

export interface MindmapSync {
  service: AppService;
  fs: MindmapFs;
  pusher: MindmapPusher;
  merge: MindmapMergeDeps;
}

let runtime: Promise<MindmapSync> | null = null;
let checkedSinceStart = false;
let trashAtPullStart: TrashedMap[] = [];

const isOnline = (): boolean => typeof navigator === 'undefined' || navigator.onLine !== false;

const canPush = async (): Promise<boolean> =>
  isSyncCategoryEnabled(MINDMAP_KIND) &&
  isOnline() &&
  transferManager.isReady() &&
  Boolean(await getAccessToken());

const createRuntime = async (): Promise<MindmapSync> => {
  const service = await environmentConfig.getAppService();
  const fs = mindmapFsFromAppService(service);
  const pusher = createMindmapPusher({
    fs,
    canPush,
    publishRow: (entry) => publishReplicaUpsert(MINDMAP_KIND, entry, entry.mapId),
    queueUpload: (record) =>
      queueReplicaBinaryUpload(MINDMAP_KIND, record, service, { isBackground: true }),
    isUploadPending: (mapId) =>
      useTransferStore.getState().getReplicaTransfer(MINDMAP_KIND, mapId, 'upload') !== undefined,
  });
  const merge: MindmapMergeDeps = {
    fs,
    clock: () => getMindmapClock(useSettingsStore.getState().settings?.replicaDeviceId ?? ''),
    schedulePush: (mapId) => pusher.schedule(mapId),
    queueDownload: (entry, file) => {
      const dir = incomingDir(entry.bundleDir);
      void fs
        .createDir(dir, MINDMAP_BASE_DIR, true)
        .then(() =>
          transferManager.queueReplicaDownload(
            MINDMAP_KIND,
            entry.mapId,
            entry.name,
            [{ logical: file.filename, lfp: `${dir}/${file.filename}`, byteSize: file.byteSize }],
            MINDMAP_BASE_DIR,
            { isBackground: true },
          ),
        )
        .catch((error: unknown) => {
          console.warn('mindmap: could not queue the newer version', { mapId: entry.mapId, error });
        });
    },
  };
  return { service, fs, pusher, merge };
};

export const getMindmapSync = (): Promise<MindmapSync> => {
  runtime ??= createRuntime();
  return runtime;
};

export const handleMindmapDownload = async (
  mapId: string,
  files: ReplicaTransferFile[],
): Promise<MergeOutcome> => mergeIncomingVersion((await getMindmapSync()).merge, mapId, files);

export const handleMindmapUpload = async (
  mapId: string,
  files: ReplicaTransferFile[],
): Promise<void> => (await getMindmapSync()).pusher.committed(mapId, files);

export const beginMindmapPull = async (): Promise<void> => {
  const { fs } = await getMindmapSync();
  await useMindmapStore.getState().hydrate(fs);
  trashAtPullStart = await listTrashedMaps(fs);
};

export const finishMindmapPull = async (): Promise<void> => {
  const { fs, pusher } = await getMindmapSync();
  await sweepTrashedMaps(fs, trashAtPullStart);
  trashAtPullStart = [];
  const mapIds = checkedSinceStart
    ? pusher.unpushed()
    : useMindmapStore.getState().entries.map((entry) => entry.mapId);
  checkedSinceStart = true;
  for (const mapId of mapIds) await pusher.pushNow(mapId);
};

export const __resetMindmapSyncForTests = (): void => {
  void runtime?.then(({ pusher }) => pusher.dispose());
  runtime = null;
  checkedSinceStart = false;
  trashAtPullStart = [];
};
