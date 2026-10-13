import { RefObject, useEffect, useRef, useState } from 'react';
import type { Rive as RiveInstance } from '@rive-app/canvas';
import type { SparkAnimation } from './sparkAnimations';

const RIVE_WASM_SRC = '/rive/rive.wasm';
const RIVE_WASM_FALLBACK_SRC = '/rive/rive_fallback.wasm';
const TRIGGER_STAGGER_MS = 120;

type RiveRuntime = typeof import('@rive-app/canvas');

let runtimePromise: Promise<RiveRuntime> | null = null;

export const loadRuntime = (): Promise<RiveRuntime> => {
  runtimePromise ??= import('@rive-app/canvas').then(
    (runtime) => {
      runtime.RuntimeLoader.setWasmUrl(RIVE_WASM_SRC);
      runtime.RuntimeLoader.setWasmFallbackUrl(RIVE_WASM_FALLBACK_SRC);
      return runtime;
    },
    (error) => {
      runtimePromise = null;
      throw error;
    },
  );
  return runtimePromise;
};

interface SparkRiveOptions {
  animation: SparkAnimation;
  hoverDevice: boolean;
  hovered: boolean;
  openDelayMs: number;
  colored: boolean;
}

const applyPalette = (rive: RiveInstance, animation: SparkAnimation, colored: boolean) => {
  if (!animation.palette) return;
  const palette = colored ? animation.palette.colored : animation.palette.muted;
  for (const [name, [r, g, b]] of Object.entries(palette)) {
    rive.viewModelInstance?.color(name)?.rgb(r, g, b);
  }
};

const setHover = (rive: RiveInstance, animation: SparkAnimation, value: boolean) => {
  if (!animation.hoverProperty) return;
  const flag = rive.viewModelInstance?.boolean(animation.hoverProperty);
  if (flag) flag.value = value;
};

const playOpenReaction = (rive: RiveInstance, animation: SparkAnimation, delayMs: number) => {
  const timers = (animation.openTriggers ?? []).map((name, i) =>
    setTimeout(
      () => rive.viewModelInstance?.trigger(name)?.trigger(),
      delayMs + i * TRIGGER_STAGGER_MS,
    ),
  );
  if (animation.openHoverMs) {
    timers.push(setTimeout(() => setHover(rive, animation, true), delayMs));
    timers.push(
      setTimeout(() => setHover(rive, animation, false), delayMs + animation.openHoverMs),
    );
  }
  return () => timers.forEach(clearTimeout);
};

export const useSparkRive = (
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { animation, hoverDevice, hovered, openDelayMs, colored }: SparkRiveOptions,
): boolean => {
  const riveRef = useRef<RiveInstance | null>(null);
  const coloredRef = useRef(colored);
  coloredRef.current = colored;
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      const [runtime, response] = await Promise.all([loadRuntime(), fetch(animation.src)]);
      if (!response.ok) throw new Error(`${response.status} loading ${animation.src}`);
      const buffer = await response.arrayBuffer();
      const canvas = canvasRef.current;
      if (disposed || !canvas) return;

      const { Rive, Layout, Fit, Alignment } = runtime;
      const rive = new Rive({
        canvas,
        buffer,
        autoplay: !animation.stillUntilHovered,
        autoBind: Boolean(
          animation.hoverProperty || animation.openTriggers?.length || animation.palette,
        ),
        stateMachine: animation.stateMachine,
        shouldDisableRiveListeners: !(hoverDevice && animation.nativeHover),
        layout: new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
        onLoad: () => {
          if (disposed) return;
          applyPalette(rive, animation, coloredRef.current);
          rive.resizeDrawingSurfaceToCanvas();
          setIsLoaded(true);
        },
      });
      riveRef.current = rive;
    };

    load().catch((error) => {
      console.warn(`Spark animation unavailable (${animation.src}):`, error);
    });

    return () => {
      disposed = true;
      riveRef.current?.cleanup();
      riveRef.current = null;
      setIsLoaded(false);
    };
  }, [canvasRef, animation, hoverDevice]);

  useEffect(() => {
    if (riveRef.current && isLoaded) applyPalette(riveRef.current, animation, colored);
  }, [animation, colored, isLoaded]);

  useEffect(() => {
    const rive = riveRef.current;
    if (!rive || !isLoaded || !hoverDevice) return;
    setHover(rive, animation, hovered);
  }, [animation, hoverDevice, hovered, isLoaded]);

  useEffect(() => {
    const rive = riveRef.current;
    if (!rive || !isLoaded || !animation.stillUntilHovered) return;
    if (hovered) rive.play(animation.stateMachine);
    else rive.pause(animation.stateMachine);
  }, [animation, hovered, isLoaded]);

  useEffect(() => {
    const rive = riveRef.current;
    if (!rive || !isLoaded || hoverDevice) return;
    return playOpenReaction(rive, animation, openDelayMs);
  }, [animation, hoverDevice, isLoaded, openDelayMs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isLoaded) return;
    const observer = new ResizeObserver(() => riveRef.current?.resizeDrawingSurfaceToCanvas());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef, isLoaded]);

  return isLoaded;
};
