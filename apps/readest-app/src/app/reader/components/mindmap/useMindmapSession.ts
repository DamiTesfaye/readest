import { useEffect, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { getMindmapClock } from '@/services/mindmap/persist/clockSource';
import { mindmapFsFromAppService } from '@/services/mindmap/persist/mindmapFs';
import { type MapSession, openMapSession } from '@/services/mindmap/persist/session';
import { useSettingsStore } from '@/store/settingsStore';

export type SessionState =
  | { status: 'loading' }
  | { status: 'open'; session: MapSession }
  | { status: 'unreadable' }
  | { status: 'already-open' };

const pendingCloses = new Map<string, Promise<void>>();

const reportError = (error: unknown): void => {
  console.error('mindmap: session error', error);
};

export const useMindmapSession = (bookHash: string | null, mapId: string | null): SessionState => {
  const { appService } = useEnv();
  const deviceId = useSettingsStore((state) => state.settings.replicaDeviceId ?? '');
  const [state, setState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    if (!appService || !bookHash || !mapId || !deviceId) return;
    let cancelled = false;
    setState({ status: 'loading' });
    const fs = mindmapFsFromAppService(appService);
    const ready = pendingCloses.get(mapId) ?? Promise.resolve();
    const opening = ready.then(() =>
      openMapSession(fs, bookHash, mapId, getMindmapClock(deviceId), {
        hooks: { onError: reportError },
      }),
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
        .then((result) => (result.status === 'open' ? result.session.close() : undefined))
        .catch(reportError)
        .finally(() => {
          if (pendingCloses.get(mapId) === closed) pendingCloses.delete(mapId);
        });
      pendingCloses.set(mapId, closed);
    };
  }, [appService, bookHash, mapId, deviceId]);

  return state;
};
