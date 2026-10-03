import { useCallback } from 'react';

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
