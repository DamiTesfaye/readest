import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetMindmapMergeNoticeForTests,
  noticeMindmapMerge,
} from '@/services/mindmap/sync/mergeNotice';
import { eventDispatcher } from '@/utils/event';

const UPDATE_NOTICE = 'Update the app to see mind map changes from your other devices';

let toasts: { type: string; message: string }[];
const onToast = (event: CustomEvent): void => {
  toasts.push(event.detail as { type: string; message: string });
};

beforeEach(() => {
  toasts = [];
  eventDispatcher.on('toast', onToast);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  eventDispatcher.off('toast', onToast);
  vi.restoreAllMocks();
  __resetMindmapMergeNoticeForTests();
});

describe('noticeMindmapMerge', () => {
  it('says nothing about a merged version', () => {
    noticeMindmapMerge('m1', 'merged');
    expect(console.warn).not.toHaveBeenCalled();
    expect(toasts).toEqual([]);
  });

  it('asks once per session to update the app for a version from a newer app', () => {
    noticeMindmapMerge('m1', 'newer-schema');
    noticeMindmapMerge('m2', 'newer-schema');
    expect(toasts).toEqual([{ type: 'info', message: UPDATE_NOTICE }]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('mindmap'), {
      mapId: 'm2',
      outcome: 'newer-schema',
    });
  });

  it('keeps every other unmerged outcome in the console', () => {
    for (const outcome of ['corrupt', 'save-failed', 'local-unreadable', 'unknown-map'] as const) {
      noticeMindmapMerge('m1', outcome);
    }
    expect(toasts).toEqual([]);
    expect(console.warn).toHaveBeenCalledTimes(4);
  });
});
