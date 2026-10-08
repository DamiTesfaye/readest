import { useSettingsStore } from '@/store/settingsStore';
import { resolveUIAnimationsEnabled } from '@/utils/animation';

export interface SceneAnimation {
  src: string;
  stateMachine: string;
  hoverProperty?: string;
}

const RIVE_DIR = '/rive/theme-cards';

const SCENE_ANIMATIONS: Record<string, SceneAnimation> = {
  'desert-sunset': {
    src: `${RIVE_DIR}/desert-sunset.riv`,
    stateMachine: 'Sunset',
  },
  'starry-night': {
    src: `${RIVE_DIR}/starry-night.riv`,
    stateMachine: 'Hover',
    hoverProperty: 'hover',
  },
  'forest-pond': {
    src: `${RIVE_DIR}/forest-pond.riv`,
    stateMachine: 'Ambient',
  },
  'ocean-wave': { src: `${RIVE_DIR}/ocean-wave.riv`, stateMachine: 'Ocean' },
  'cherry-bloom': { src: `${RIVE_DIR}/cherry-bloom.riv`, stateMachine: 'Wind' },
};

export const getSceneAnimation = (themeName: string): SceneAnimation | null =>
  SCENE_ANIMATIONS[themeName] ?? null;

export const isSceneMotionAllowed = (): boolean => {
  if (typeof window === 'undefined') return false;
  const root = document.documentElement;
  if (root.getAttribute('data-ui-anim') === 'off') return false;
  if (root.getAttribute('data-eink') === 'true') return false;
  return resolveUIAnimationsEnabled(useSettingsStore.getState().settings);
};
