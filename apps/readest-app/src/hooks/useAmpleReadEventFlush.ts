import { useCallback, useEffect } from 'react';

import { useWindowActiveChanged } from '@/app/reader/hooks/useWindowActiveChanged';
import { flushEvents } from '@/services/ampleread';
import { eventDispatcher } from '@/utils/event';

const flushQuietly = () => {
  flushEvents().catch((err) => {
    console.error('AmpleRead: failed to flush events', err);
  });
};

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
