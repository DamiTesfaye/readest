'use client';

import clsx from 'clsx';
import React, { useEffect, useRef, useState } from 'react';
import type { Rive as RiveInstance } from '@rive-app/canvas';
import { getSceneAnimation, SceneAnimation } from './sceneAnimations';

const CARD_ASSETS = '/images/theme-cards';
const RIVE_WASM_SRC = '/rive/rive.wasm';
const RIVE_WASM_FALLBACK_SRC = '/rive/rive_fallback.wasm';
const FADE_OUT_MS = 300;

let runtimeConfigured = false;

const setHoverFlag = (rive: RiveInstance, scene: SceneAnimation, value: boolean) => {
  if (!scene.hoverProperty) return;
  const flag = rive.viewModelInstance?.boolean(scene.hoverProperty);
  if (flag) flag.value = value;
};

interface SceneCanvasProps {
  scene: SceneAnimation;
  active: boolean;
}

const SceneCanvas: React.FC<SceneCanvasProps> = ({ scene, active }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const riveRef = useRef<RiveInstance | null>(null);
  const [requested, setRequested] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (active) setRequested(true);
  }, [active]);

  useEffect(() => {
    if (!requested) return;
    let disposed = false;

    const load = async () => {
      const [runtime, response] = await Promise.all([import('@rive-app/canvas'), fetch(scene.src)]);
      if (!response.ok) throw new Error(`${response.status} loading ${scene.src}`);
      const buffer = await response.arrayBuffer();
      const canvas = canvasRef.current;
      if (disposed || !canvas) return;

      const { Rive, Layout, Fit, Alignment, RuntimeLoader } = runtime;
      if (!runtimeConfigured) {
        runtimeConfigured = true;
        RuntimeLoader.setWasmUrl(RIVE_WASM_SRC);
        RuntimeLoader.setWasmFallbackUrl(RIVE_WASM_FALLBACK_SRC);
      }

      const rive = new Rive({
        canvas,
        buffer,
        autoplay: false,
        autoBind: true,
        stateMachines: scene.stateMachine,
        shouldDisableRiveListeners: true,
        layout: new Layout({ fit: Fit.Cover, alignment: Alignment.Center }),
        onLoad: () => {
          if (disposed) return;
          rive.resizeDrawingSurfaceToCanvas();
          setIsLoaded(true);
        },
      });
      riveRef.current = rive;
    };

    load().catch((error) => {
      console.warn(`Theme animation unavailable (${scene.src}):`, error);
    });

    return () => {
      disposed = true;
      riveRef.current?.cleanup();
      riveRef.current = null;
      setIsLoaded(false);
    };
  }, [requested, scene]);

  useEffect(() => {
    const rive = riveRef.current;
    if (!rive || !isLoaded) return;
    if (active) {
      setHoverFlag(rive, scene, true);
      rive.play();
      return;
    }
    setHoverFlag(rive, scene, false);
    const rewind = setTimeout(() => {
      rive.reset({
        stateMachines: scene.stateMachine,
        autoplay: false,
        autoBind: true,
      });
    }, FADE_OUT_MS);
    return () => clearTimeout(rewind);
  }, [active, isLoaded, scene]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isLoaded) return;
    const observer = new ResizeObserver(() => riveRef.current?.resizeDrawingSurfaceToCanvas());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [isLoaded]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden='true'
      data-testid='theme-scene-canvas'
      className={clsx(
        'pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-300',
        isLoaded && active ? 'opacity-100' : 'opacity-0',
      )}
    />
  );
};

interface ThemeSceneArtProps {
  themeName: string;
  active: boolean;
  imgClassName?: string;
}

const ThemeSceneArt: React.FC<ThemeSceneArtProps> = ({ themeName, active, imgClassName }) => {
  const scene = getSceneAnimation(themeName);
  return (
    <>
      <img
        src={`${CARD_ASSETS}/${themeName}.svg`}
        alt=''
        draggable={false}
        className={imgClassName}
      />
      {scene && <SceneCanvas scene={scene} active={active} />}
    </>
  );
};

export default ThemeSceneArt;
