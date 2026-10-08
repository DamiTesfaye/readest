import { useSyncExternalStore } from 'react';
import { useSettingsStore } from '@/store/settingsStore';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const hasMatchMedia = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function';

const subscribeToReducedMotion = (notify: () => void) => {
  if (!hasMatchMedia()) return () => {};
  const list = window.matchMedia(REDUCED_MOTION_QUERY);
  list.addEventListener('change', notify);
  return () => list.removeEventListener('change', notify);
};

const getReducedMotion = () => hasMatchMedia() && window.matchMedia(REDUCED_MOTION_QUERY).matches;

export const useUIAnimationsEnabled = (): boolean => {
  const preference = useSettingsStore((state) => state.settings?.uiAnimationsEnabled);
  const osReducesMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotion,
    () => false,
  );
  return preference ?? !osReducesMotion;
};
