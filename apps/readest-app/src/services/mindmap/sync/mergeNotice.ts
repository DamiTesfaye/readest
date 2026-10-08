import i18n from '@/i18n/i18n';
import type { MergeOutcome } from '@/services/mindmap/sync/merge';
import { eventDispatcher } from '@/utils/event';

const _ = (key: string): string => i18n.t(key, { defaultValue: key });

let askedToUpdate = false;

export const noticeMindmapMerge = (mapId: string, outcome: MergeOutcome): void => {
  if (outcome === 'merged') return;
  console.warn('mindmap: a downloaded version was not merged', { mapId, outcome });
  if (outcome !== 'newer-schema' || askedToUpdate) return;
  askedToUpdate = true;
  eventDispatcher.dispatch('toast', {
    type: 'info',
    message: _('Update the app to see mind map changes from your other devices'),
  });
};

export const __resetMindmapMergeNoticeForTests = (): void => {
  askedToUpdate = false;
};
