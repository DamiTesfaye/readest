import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { Atom } from '@/services/mindmap/atom';
import type { MapRecord } from '@/services/mindmap/schema/types';
import type { Diff, MapStore } from '@/services/mindmap/store/mapStore';

export const useAtomValue = <T>(atom: Atom<T>): T =>
  useSyncExternalStore(atom.subscribe, atom.get, atom.get);

export const useMapRecords = (store: MapStore): MapRecord[] => {
  const subscribe = useCallback((notify: () => void) => store.listen(() => notify()), [store]);
  return useSyncExternalStore(subscribe, store.all, store.all);
};

export const useMapRecordsWhen = (
  store: MapStore,
  touches: (diff: Diff) => boolean,
): MapRecord[] => {
  const snapshot = useRef<MapRecord[] | null>(null);
  snapshot.current ??= store.all();
  const subscribe = useCallback(
    (notify: () => void) => {
      snapshot.current = store.all();
      return store.listen((diff) => {
        if (!touches(diff)) return;
        snapshot.current = store.all();
        notify();
      });
    },
    [store, touches],
  );
  const get = useCallback(() => snapshot.current!, []);
  return useSyncExternalStore(subscribe, get, get);
};

type RecordListener = (id: string, listener: () => void) => () => void;

const recordHubs = new WeakMap<MapStore, RecordListener>();

const recordHub = (store: MapStore): RecordListener => {
  const existing = recordHubs.get(store);
  if (existing) return existing;
  const listeners = new Map<string, Set<() => void>>();
  let unlisten: (() => void) | null = null;
  const onDiff = (diff: Diff): void => {
    const ids = new Set([
      ...diff.added.map((record) => record.id),
      ...diff.changed.map((change) => change.id),
      ...diff.discarded,
    ]);
    for (const id of ids) for (const listener of [...(listeners.get(id) ?? [])]) listener();
  };
  const listen: RecordListener = (id, listener) => {
    const set = listeners.get(id) ?? new Set();
    set.add(listener);
    listeners.set(id, set);
    unlisten ??= store.listen(onDiff);
    return () => {
      set.delete(listener);
      if (set.size === 0) listeners.delete(id);
      if (listeners.size === 0 && unlisten) {
        unlisten();
        unlisten = null;
      }
    };
  };
  recordHubs.set(store, listen);
  return listen;
};

export const useRecord = (store: MapStore, id: string): MapRecord | undefined => {
  const subscribe = useCallback((notify: () => void) => recordHub(store)(id, notify), [store, id]);
  const get = useCallback(() => store.get(id), [store, id]);
  return useSyncExternalStore(subscribe, get, get);
};
