import { useEffect, useRef, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { getMindmapClock } from '@/services/mindmap/persist/clockSource';
import { mindmapFsFromAppService } from '@/services/mindmap/persist/mindmapFs';
import { type MapSession, openMapSession } from '@/services/mindmap/persist/session';
import { useSettingsStore } from '@/store/settingsStore';
import { eventDispatcher } from '@/utils/event';

export type SessionState =
  | { status: 'loading' }
  | { status: 'open'; session: MapSession }
  | { status: 'unreadable' }
  | { status: 'already-open' };

export const SAVE_ERROR_TOAST_INTERVAL_MS = 30_000;

const pendingCloses = new Map<string, Promise<void>>();

const reportError = (error: unknown): void => {
  console.error('mindmap: session error', error);
};

export const useMindmapSession = (bookHash: string | null, mapId: string | null): SessionState => {
  const { appService } = useEnv();
  const deviceId = useSettingsStore((state) => state.settings.replicaDeviceId ?? '');
  const _ = useTranslation();
  const translate = useRef(_);
  translate.current = _;
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    if (!appService || !bookHash || !mapId || !deviceId) return;
    let cancelled = false;
    let lastToast = Number.NEGATIVE_INFINITY;
    const toastSaveError = (): void => {
      lastToast = Date.now();
      eventDispatcher.dispatch('toast', {
        type: 'error',
        message: translate.current('Could not save the mind map'),
      });
    };
    const onError = (error: unknown): void => {
      reportError(error);
      if (!cancelled && Date.now() - lastToast >= SAVE_ERROR_TOAST_INTERVAL_MS) toastSaveError();
    };
    setState({ status: 'loading' });
    const fs = mindmapFsFromAppService(appService);
    const ready = pendingCloses.get(mapId) ?? Promise.resolve();
    const opening = ready.then(() =>
      openMapSession(fs, bookHash, mapId, getMindmapClock(deviceId), { hooks: { onError } }),
    );
    opening
      .then((result) => {
        if (!cancelled)
          setState(result.status === 'open' ? { status: 'open', session: result.session } : result);
      })
      .catch((error: unknown) => {
        reportError(error);
        if (!cancelled) setState({ status: 'unreadable' });
      });
    return () => {
      cancelled = true;
      const closed = opening
        .then(async (result) => {
          if (result.status === 'open' && !(await result.session.close())) toastSaveError();
        })
        .catch(reportError)
        .finally(() => {
          if (pendingCloses.get(mapId) === closed) pendingCloses.delete(mapId);
        });
      pendingCloses.set(mapId, closed);
    };
  }, [appService, bookHash, mapId, deviceId]);

  return state;
};
