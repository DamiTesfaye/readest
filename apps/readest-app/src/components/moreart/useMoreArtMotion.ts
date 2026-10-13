import { CSSProperties, useEffect, useState } from 'react';
import { isSceneMotionAllowed } from '@/components/themescene/sceneAnimations';
import { canHover } from '@/components/sparkrive/sparkAnimations';
import { useUIAnimationsEnabled } from '@/hooks/useUIAnimationsEnabled';

export interface MoreArtProps {
  colored: boolean;
  hovered: boolean;
  openDelayMs: number;
}

const TOUCH_PLAY_MS = 1500;

export const playStyle = (name: string, seconds: number, origin: string): CSSProperties => ({
  transformBox: 'view-box',
  transformOrigin: origin,
  animationName: name,
  animationDuration: `${seconds}s`,
  animationTimingFunction: 'ease-in-out',
  animationIterationCount: 'infinite',
});

const useTouchOpenPlay = (enabled: boolean, openDelayMs: number): boolean => {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const timers = [
      setTimeout(() => setPlaying(true), openDelayMs),
      setTimeout(() => setPlaying(false), openDelayMs + TOUCH_PLAY_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, [enabled, openDelayMs]);
  return playing;
};

export const useMoreArtMotion = (hovered: boolean, openDelayMs: number) => {
  const motionAllowed = useUIAnimationsEnabled() && isSceneMotionAllowed();
  const [hoverDevice] = useState(canHover);
  const touchPlaying = useTouchOpenPlay(motionAllowed && !hoverDevice, openDelayMs);
  const active = motionAllowed && (hoverDevice ? hovered : touchPlaying);
  const [settling, setSettling] = useState(false);
  const [prevActive, setPrevActive] = useState(active);
  if (active !== prevActive) {
    setPrevActive(active);
    setSettling(!active);
  }
  return {
    animating: active || (settling && motionAllowed),
    onAnimationIteration: () => {
      if (!active) setSettling(false);
    },
  };
};
