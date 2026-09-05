import { useCallback, useEffect } from 'react';

import { useWindowActiveChanged } from '@/app/reader/hooks/useWindowActiveChanged';
import { flushEvents } from '@/services/ampleread';
import { eventDispatcher } from '@/utils/event';

const flushQuietly = () => {
  flushEvents().catch((err) => {
    console.error('AmpleRead: failed to flush events', err);
  });
};

/// Pushes queued AmpleRead events when the app leaves the foreground or is
/// about to quit. Backgrounding rides the existing window-active hook
/// (visibilitychange on web/mobile, window focus on desktop); quitting rides
/// the quit-app event that tauriQuitApp already dispatches. On the web
/// passthrough flushEvents is a no-op, so this costs nothing there.
export const useAmpleReadEventFlush = () => {
  useWindowActiveChanged(
    useCallback((isActive: boolean) => {
      if (!isActive) flushQuietly();
    }, []),
  );

  useEffect(() => {
    const onQuit = () => flushQuietly();
    eventDispatcher.on('quit-app', onQuit);
    return () => eventDispatcher.off('quit-app', onQuit);
  }, []);
};
