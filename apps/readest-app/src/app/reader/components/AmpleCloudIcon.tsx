'use client';

import clsx from 'clsx';
import React, { useEffect, useRef, useState } from 'react';
import type { Rive as RiveInstance } from '@rive-app/canvas';
import { isSceneMotionAllowed } from '@/components/themescene/sceneAnimations';
import { getToolbarIconSrc, isColoredIconTheme } from '@/utils/toolbarIcons';

const RIVE_SRC = '/rive/ample-cloud.riv';
const RIVE_WASM_SRC = '/rive/rive.wasm';
const RIVE_WASM_FALLBACK_SRC = '/rive/rive_fallback.wasm';
const STATE_MACHINE = 'Cloud';
const HOVER_PROPERTY = 'hover';
const COLOR_PROPERTY = 'color';
const COLORED_FILL = [0xf4, 0x68, 0x31] as const;
const MUTED_FILL = [0xfc, 0xfc, 0xfc] as const;
const ICON_CLASS = 'h-5 w-auto object-contain';

let runtimeConfigured = false;

const setHoverFlag = (rive: RiveInstance | null, value: boolean) => {
  const flag = rive?.viewModelInstance?.boolean(HOVER_PROPERTY);
  if (flag) flag.value = value;
};

const setCloudColor = (rive: RiveInstance | null, colored: boolean) => {
  const [r, g, b] = colored ? COLORED_FILL : MUTED_FILL;
  rive?.viewModelInstance?.color(COLOR_PROPERTY)?.rgb(r, g, b);
};

const usePageVisible = () => {
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  );
  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return pageVisible;
};

const useOnScreen = (ref: React.RefObject<Element | null>) => {
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') {
      setOnScreen(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry) setOnScreen(entry.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return onScreen;
};

interface CloudCanvasProps {
  src: string;
  colored: boolean;
  visible: boolean;
}

const CloudCanvas: React.FC<CloudCanvasProps> = ({ src, colored, visible }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const riveRef = useRef<RiveInstance | null>(null);
  const coloredRef = useRef(colored);
  coloredRef.current = colored;
  const [requested, setRequested] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const pageVisible = usePageVisible();
  const onScreen = useOnScreen(canvasRef);
  const playing = visible && pageVisible && onScreen;

  useEffect(() => {
    if (playing) setRequested(true);
  }, [playing]);

  useEffect(() => {
    if (!requested) return;
    let disposed = false;

    const load = async () => {
      const [runtime, response] = await Promise.all([import('@rive-app/canvas'), fetch(RIVE_SRC)]);
      if (!response.ok) throw new Error(`${response.status} loading ${RIVE_SRC}`);
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
        stateMachines: STATE_MACHINE,
        shouldDisableRiveListeners: true,
        layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
        onLoad: () => {
          if (disposed) return;
          setCloudColor(rive, coloredRef.current);
          rive.resizeDrawingSurfaceToCanvas();
          setIsLoaded(true);
        },
      });
      riveRef.current = rive;
    };

    load().catch((error) => {
      console.warn('Ample cloud animation unavailable:', error);
    });

    return () => {
      disposed = true;
      riveRef.current?.cleanup();
      riveRef.current = null;
      setIsLoaded(false);
    };
  }, [requested]);

  useEffect(() => {
    if (isLoaded) setCloudColor(riveRef.current, colored);
  }, [colored, isLoaded]);

  useEffect(() => {
    const rive = riveRef.current;
    if (!rive || !isLoaded) return;
    if (playing) {
      rive.play();
      return;
    }
    setHoverFlag(rive, false);
    rive.pause();
  }, [playing, isLoaded]);

  const handlePointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') setHoverFlag(riveRef.current, true);
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') setHoverFlag(riveRef.current, false);
  };

  return (
    <span
      data-testid='ample-cloud'
      className='relative flex h-full w-full items-center justify-center'
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <img src={src} alt='' className={clsx(ICON_CLASS, isLoaded && 'invisible')} />
      <canvas
        ref={canvasRef}
        aria-hidden='true'
        data-testid='ample-cloud-canvas'
        className={clsx(
          'pointer-events-none absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2',
          isLoaded ? 'opacity-100' : 'opacity-0',
        )}
      />
    </span>
  );
};

interface AmpleCloudIconProps {
  themeName: string;
  isDarkMode: boolean;
  visible: boolean;
}

const AmpleCloudIcon: React.FC<AmpleCloudIconProps> = ({ themeName, isDarkMode, visible }) => {
  const src = getToolbarIconSrc('amply', themeName, isDarkMode);
  if (!isSceneMotionAllowed()) {
    return <img src={src} alt='' className={ICON_CLASS} />;
  }
  return (
    <CloudCanvas src={src} colored={isColoredIconTheme(themeName, isDarkMode)} visible={visible} />
  );
};

export default AmpleCloudIcon;
