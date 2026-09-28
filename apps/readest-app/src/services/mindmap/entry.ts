import type { HlcClock } from '@/services/mindmap/file/clock';
import { canCreateMap } from '@/services/mindmap/limits';
import type { MindmapFs } from '@/services/mindmap/persist/mindmapFs';
import { loadMindmapIndex } from '@/services/mindmap/persist/mindmapIndex';
import { useMindmapStore } from '@/services/mindmap/persist/mindmapStore';
import {
  DEFAULT_MAP_META,
  type MapIntent,
  type MapSource,
  type MapSpoiler,
  type MapStyle,
} from '@/services/mindmap/schema/types';
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

export const resolveMapEntry = async (fs: MindmapFs, bookHash: string): Promise<EntryTarget> => {
  await useMindmapStore.getState().hydrate(fs);
  const [latest] = await loadMindmapIndex(fs, bookHash);
  return latest ? { kind: 'map', mapId: latest.mapId } : { kind: 'sheet' };
};

export const bookMapCount = async (fs: MindmapFs, bookHash: string): Promise<number> => {
  await useMindmapStore.getState().hydrate(fs);
  return useMindmapStore.getState().entriesForBook(bookHash).length;
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
