import type { HlcClock } from '@/services/mindmap/file/clock';
import { canCreateMap } from '@/services/mindmap/limits';
import type { MindmapFs } from '@/services/mindmap/persist/mindmapFs';
import { loadMindmapIndex } from '@/services/mindmap/persist/mindmapIndex';
import { useMindmapStore } from '@/services/mindmap/persist/mindmapStore';
import { listTrashedMaps, sweepTrashedMaps } from '@/services/mindmap/persist/mindmapTrash';
import {
  DEFAULT_MAP_META,
  type MapIntent,
  type MapSource,
  type MapSpoiler,
  type MapStyle,
} from '@/services/mindmap/schema/types';
import { MINDMAP_KIND } from '@/services/sync/adapters/mindmap';
import { isSyncCategoryEnabled } from '@/services/sync/syncCategories';
import type { UserPlan } from '@/types/quota';
import { getAccessToken, getUserProfilePlan } from '@/utils/access';

export type EntryTarget = { kind: 'map'; mapId: string } | { kind: 'sheet' };

export interface NewMapChoices {
  title: string;
  source: MapSource;
  intent: MapIntent;
  spoiler: MapSpoiler;
  style: MapStyle;
}

export interface CreateBookMapInput {
  fs: MindmapFs;
  bookHash: string;
  plan: UserPlan;
  choices: NewMapChoices;
  progress: number;
  clock: HlcClock;
}

export type CreateBookMapResult = { status: 'created'; mapId: string } | { status: 'limit' };

let trashEmptied: Promise<void> | null = null;

const emptyTrashWithoutSync = async (fs: MindmapFs): Promise<void> => {
  if (isSyncCategoryEnabled(MINDMAP_KIND) && (await getAccessToken())) return;
  await sweepTrashedMaps(fs, await listTrashedMaps(fs));
};

const hydrateStore = async (fs: MindmapFs): Promise<void> => {
  await useMindmapStore.getState().hydrate(fs);
  trashEmptied ??= emptyTrashWithoutSync(fs).catch((error: unknown) => {
    console.warn('mindmap: could not empty the trash without sync', { error });
  });
  await trashEmptied;
};

export const resolveMapEntry = async (
  fs: MindmapFs,
  bookHash: string,
  preferredMapId?: string,
): Promise<EntryTarget> => {
  await hydrateStore(fs);
  const index = await loadMindmapIndex(fs, bookHash);
  const target = index.find((entry) => entry.mapId === preferredMapId) ?? index[0];
  return target ? { kind: 'map', mapId: target.mapId } : { kind: 'sheet' };
};

export const bookMapCount = async (fs: MindmapFs, bookHash: string): Promise<number> => {
  await hydrateStore(fs);
  return (await loadMindmapIndex(fs, bookHash)).length;
};

export const createBookMap = async (input: CreateBookMapInput): Promise<CreateBookMapResult> => {
  const count = await bookMapCount(input.fs, input.bookHash);
  if (!canCreateMap(input.plan, count)) return { status: 'limit' };
  const file = await useMindmapStore
    .getState()
    .createMap(
      input.bookHash,
      { ...DEFAULT_MAP_META, ...input.choices, lastSeenProgress: input.progress },
      input.clock,
    );
  return { status: 'created', mapId: file.mapId };
};

export const currentUserPlan = async (): Promise<UserPlan> => {
  const token = await getAccessToken();
  return token ? getUserProfilePlan(token) : 'free';
};

export const __resetMindmapEntryForTests = (): void => {
  trashEmptied = null;
};
