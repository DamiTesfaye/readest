import { SystemSettings } from '@/types/settings';

export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

export const resolveUIAnimationsEnabled = (
  settings: Pick<SystemSettings, 'uiAnimationsEnabled'>,
): boolean => {
  return settings.uiAnimationsEnabled ?? !prefersReducedMotion();
};

export const applyPagingAnimation = (
  renderer: Pick<Element, 'toggleAttribute'>,
  pagingAnimated: boolean,
  uiAnimationsEnabled: boolean,
) => {
  renderer.toggleAttribute('animated', pagingAnimated && uiAnimationsEnabled);
};
