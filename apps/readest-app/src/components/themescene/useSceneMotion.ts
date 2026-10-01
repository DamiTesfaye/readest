import React, { useCallback, useEffect, useRef, useState } from 'react';
import { isSceneMotionAllowed } from './sceneAnimations';

export const SCENE_TAP_PLAY_MS = 4000;

export interface SceneMotion {
  active: boolean;
  handlers: {
    onPointerEnter: (e: React.PointerEvent) => void;
    onPointerLeave: (e: React.PointerEvent) => void;
    onPointerDown: (e: React.PointerEvent) => void;
  };
  onSelect: () => void;
}

export const useSceneMotion = (): SceneMotion => {
  const [hovered, setHovered] = useState(false);
  const [pulsing, setPulsing] = useState(false);
  const lastPointerType = useRef<string | null>(null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPulse = () => {
    if (pulseTimer.current) clearTimeout(pulseTimer.current);
    pulseTimer.current = null;
  };

  useEffect(() => clearPulse, []);

  const onPointerEnter = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || !isSceneMotionAllowed()) return;
    setHovered(true);
  }, []);

  const onPointerLeave = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    setHovered(false);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    lastPointerType.current = e.pointerType;
  }, []);

  const onSelect = useCallback(() => {
    const pointerType = lastPointerType.current;
    lastPointerType.current = null;
    if (pointerType === 'mouse' || !isSceneMotionAllowed()) return;
    clearPulse();
    setPulsing(true);
    pulseTimer.current = setTimeout(() => {
      pulseTimer.current = null;
      setPulsing(false);
    }, SCENE_TAP_PLAY_MS);
  }, []);

  return {
    active: hovered || pulsing,
    handlers: { onPointerEnter, onPointerLeave, onPointerDown },
    onSelect,
  };
};
