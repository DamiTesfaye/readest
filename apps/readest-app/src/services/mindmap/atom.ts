export interface Atom<T> {
  get(): T;
  set(next: T): void;
  subscribe(listener: () => void): () => void;
}

export const createAtom = <T>(initial: T): Atom<T> => {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};
