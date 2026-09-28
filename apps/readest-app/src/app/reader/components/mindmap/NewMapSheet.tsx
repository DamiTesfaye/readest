import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';
import Dialog from '@/components/Dialog';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import {
  type NewMapChoices,
  bookMapCount,
  createBookMap,
  currentUserPlan,
} from '@/services/mindmap/entry';
import { FREE_MAP_LIMIT, canCreateMap } from '@/services/mindmap/limits';
import { getMindmapClock } from '@/services/mindmap/persist/clockSource';
import { mindmapFsFromAppService } from '@/services/mindmap/persist/mindmapFs';
import type { MapIntent, MapSource, MapSpoiler, MapStyle } from '@/services/mindmap/schema/types';
import { useBookDataStore } from '@/store/bookDataStore';
import { useMindmapViewStore } from '@/store/mindmapViewStore';
import { useReaderStore } from '@/store/readerStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { UserPlan } from '@/types/quota';
import { eventDispatcher } from '@/utils/event';
import { navigateToProfile } from '@/utils/nav';
import { intentLabels, spoilerLabels, styleLabels } from './mapLabels';

const INTENTS: MapIntent[] = ['adaptive', 'study', 'story', 'personal'];
const SPOILERS: MapSpoiler[] = ['adaptive', 'grow', 'fogged', 'whole'];
const STYLES: MapStyle[] = ['sticker', 'paper', 'ink'];
const FIELD = 'flex flex-col gap-1 text-sm';

const NewMapSheet: React.FC<{ bookKey: string }> = ({ bookKey }) => {
  const _ = useTranslation();
  const router = useRouter();
  const { appService } = useEnv();
  const { closeSheet, showMap } = useMindmapViewStore();
  const book = useBookDataStore((state) => state.getBookData(bookKey)?.book ?? null);
  const deviceId = useSettingsStore((state) => state.settings.replicaDeviceId ?? '');
  const [choices, setChoices] = useState<NewMapChoices>({
    title: book?.title ?? '',
    source: 'generated',
    intent: 'adaptive',
    spoiler: 'adaptive',
    style: 'sticker',
  });
  const [plan, setPlan] = useState<UserPlan | null>(null);
  const [limited, setLimited] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!appService || !book) return;
    let cancelled = false;
    Promise.all([currentUserPlan(), bookMapCount(mindmapFsFromAppService(appService), book.hash)])
      .then(([nextPlan, count]) => {
        if (cancelled) return;
        setPlan(nextPlan);
        setLimited(!canCreateMap(nextPlan, count));
      })
      .catch((error: unknown) => {
        console.error('mindmap: failed to check the map limit', error);
        if (!cancelled) setPlan('free');
      });
    return () => {
      cancelled = true;
    };
  }, [appService, book]);

  useEffect(() => {
    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== document.body ? active : null;
    return () => {
      requestAnimationFrame(() => {
        const focused = document.activeElement;
        if (focused && focused !== document.body) return;
        const target = opener?.isConnected
          ? opener
          : document.querySelector<HTMLElement>('[data-mindmap-root]');
        target?.focus({ preventScroll: true });
      });
    };
  }, []);

  const update = <K extends keyof NewMapChoices>(key: K, value: NewMapChoices[K]): void =>
    setChoices((current) => ({ ...current, [key]: value }));

  const create = async (): Promise<void> => {
    if (!appService || !book || !deviceId || !plan) return;
    setBusy(true);
    try {
      const result = await createBookMap({
        fs: mindmapFsFromAppService(appService),
        bookHash: book.hash,
        plan,
        choices: { ...choices, title: choices.title.trim() || book.title },
        progress: useReaderStore.getState().getProgress(bookKey)?.fraction ?? 0,
        clock: getMindmapClock(deviceId),
      });
      if (result.status === 'limit') setLimited(true);
      else showMap(bookKey, result.mapId);
    } catch (error) {
      console.error('mindmap: failed to create a map', error);
      eventDispatcher.dispatch('toast', {
        type: 'error',
        message: _('Could not create the mind map'),
      });
    } finally {
      setBusy(false);
    }
  };

  const intents = intentLabels(_);
  const spoilers = spoilerLabels(_);
  const styles = styleLabels(_);

  return (
    <Dialog isOpen title={_('New mind map')} onClose={closeSheet} boxClassName='sm:min-w-[480px]'>
      {limited ? (
        <div data-testid='mm-map-limit' className='flex flex-col gap-4 p-4 text-sm'>
          <p>
            {_(
              'The free plan includes {{limit}} mind maps per book. Your existing maps stay available.',
              {
                limit: FREE_MAP_LIMIT,
              },
            )}
          </p>
          <div className='flex justify-end gap-2'>
            <button type='button' className='btn btn-ghost' onClick={closeSheet}>
              {_('Not now')}
            </button>
            <button
              type='button'
              className='btn btn-primary'
              onClick={() => navigateToProfile(router)}
            >
              {_('Upgrade to Readest Premium')}
            </button>
          </div>
        </div>
      ) : (
        <form
          className='flex flex-col gap-4 p-4'
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label className={FIELD}>
            {_('Title')}
            <input
              className='input input-bordered eink-bordered w-full'
              value={choices.title}
              onChange={(event) => update('title', event.target.value)}
            />
          </label>
          <fieldset className={FIELD}>
            <legend className='mb-1'>{_('Start from')}</legend>
            {(['generated', 'blank'] as MapSource[]).map((source) => (
              <label key={source} className='flex items-center gap-2'>
                <input
                  type='radio'
                  className='radio radio-sm'
                  name='mm-source'
                  checked={choices.source === source}
                  onChange={() => update('source', source)}
                />
                {source === 'generated' ? _('Generated from the book') : _('Blank canvas')}
              </label>
            ))}
          </fieldset>
          <label className={FIELD}>
            {_('Intent')}
            <select
              className='select select-bordered eink-bordered'
              value={choices.intent}
              onChange={(event) => update('intent', event.target.value as MapIntent)}
            >
              {INTENTS.map((intent) => (
                <option key={intent} value={intent}>
                  {intents[intent]}
                </option>
              ))}
            </select>
          </label>
          <label className={FIELD}>
            {_('Spoilers')}
            <select
              className='select select-bordered eink-bordered'
              value={choices.spoiler}
              onChange={(event) => update('spoiler', event.target.value as MapSpoiler)}
            >
              {SPOILERS.map((spoiler) => (
                <option key={spoiler} value={spoiler}>
                  {spoilers[spoiler]}
                </option>
              ))}
            </select>
          </label>
          <label className={FIELD}>
            {_('Style')}
            <select
              className='select select-bordered eink-bordered'
              value={choices.style}
              onChange={(event) => update('style', event.target.value as MapStyle)}
            >
              {STYLES.map((style) => (
                <option key={style} value={style}>
                  {styles[style]}
                </option>
              ))}
            </select>
          </label>
          <div className='flex justify-end gap-2'>
            <button type='button' className='btn btn-ghost' onClick={closeSheet}>
              {_('Cancel')}
            </button>
            <button
              type='submit'
              className='btn btn-contrast'
              disabled={busy || !deviceId || !plan}
            >
              {_('Create map')}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
};

export default NewMapSheet;
