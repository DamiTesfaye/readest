import { useCallback, useEffect } from 'react';
import { useUIAnimationsEnabled } from './useUIAnimationsEnabled';

export const useUIAnimationsMode = () => {
  const applyUIAnimationsMode = useCallback((enabled: boolean) => {
    if (enabled) {
      document.documentElement.removeAttribute('data-ui-anim');
    } else {
      document.documentElement.setAttribute('data-ui-anim', 'off');
    }
  }, []);

  return { applyUIAnimationsMode };
};

export const useUIAnimationsRootSync = () => {
  const enabled = useUIAnimationsEnabled();
  const { applyUIAnimationsMode } = useUIAnimationsMode();
  useEffect(() => {
    applyUIAnimationsMode(enabled);
  }, [enabled, applyUIAnimationsMode]);
};
