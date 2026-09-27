import { useCallback, useSyncExternalStore } from 'react';
import type { Atom } from '@/services/mindmap/atom';
import type { MapRecord } from '@/services/mindmap/schema/types';
import type { MapStore } from '@/services/mindmap/store/mapStore';

export const useAtomValue = <T>(atom: Atom<T>): T =>
  useSyncExternalStore(atom.subscribe, atom.get, atom.get);

export const useMapRecords = (store: MapStore): MapRecord[] => {
  const subscribe = useCallback((notify: () => void) => store.listen(() => notify()), [store]);
  return useSyncExternalStore(subscribe, store.all, store.all);
};
