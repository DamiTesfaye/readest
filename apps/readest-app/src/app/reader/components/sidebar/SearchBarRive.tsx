'use client';

import clsx from 'clsx';
import React, { useEffect, useRef, useState } from 'react';
import type { Rive as RiveInstance, StateMachineInput } from '@rive-app/canvas';

const RIVE_SRC = '/rive/christmas-searchbox.riv';
const RIVE_WASM_SRC = '/rive/rive.wasm';
const RIVE_WASM_FALLBACK_SRC = '/rive/rive_fallback.wasm';
const ARTBOARD = 'pup claude work  2';
const STATE_MACHINE = 'State Machine 1';
const HOVER_INPUT = 'searchHover';
const TAP_INPUT = 'tap';
const PRESSED_INPUT = 'pressed';
const EMPTY_INPUT = 'empty';
export const YAY_DURATION_MS = 2800;

let runtimeConfigured = false;

interface SearchBarRiveProps {
  hasResults: boolean;
  isEmpty?: boolean;
  className?: string;
  onLoadedChange?: (loaded: boolean) => void;
}

const SearchBarRive: React.FC<SearchBarRiveProps> = ({
  hasResults,
  isEmpty = true,
  className,
  onLoadedChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const riveRef = useRef<RiveInstance | null>(null);
  const hoverInputRef = useRef<StateMachineInput | null>(null);
  const tapInputRef = useRef<StateMachineInput | null>(null);
  const pressedInputRef = useRef<StateMachineInput | null>(null);
  const emptyInputRef = useRef<StateMachineInput | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
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
        artboard: ARTBOARD,
        autoplay: true,
        stateMachines: STATE_MACHINE,
        layout: new Layout({ fit: Fit.Contain, alignment: Alignment.BottomCenter }),
        onLoad: () => {
          if (disposed) return;
          rive.resizeDrawingSurfaceToCanvas();
          const inputs = rive.stateMachineInputs(STATE_MACHINE) ?? [];
          const findInput = (name: string) => inputs.find((i) => i.name === name) ?? null;
          hoverInputRef.current = findInput(HOVER_INPUT);
          tapInputRef.current = findInput(TAP_INPUT);
          pressedInputRef.current = findInput(PRESSED_INPUT);
          emptyInputRef.current = findInput(EMPTY_INPUT);
          setIsLoaded(true);
        },
      });
      riveRef.current = rive;
    };

    load().catch((error) => {
      console.warn('Search bar animation unavailable:', error);
    });

    return () => {
      disposed = true;
      hoverInputRef.current = null;
      tapInputRef.current = null;
      pressedInputRef.current = null;
      emptyInputRef.current = null;
      riveRef.current?.cleanup();
      riveRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    onLoadedChange?.(true);
    return () => onLoadedChange?.(false);
  }, [isLoaded, onLoadedChange]);

  useEffect(() => {
    const hover = hoverInputRef.current;
    if (!isLoaded || !hover) return;
    hover.value = hasResults;
    if (!hasResults) return;
    const timer = setTimeout(() => {
      hover.value = false;
    }, YAY_DURATION_MS);
    return () => clearTimeout(timer);
  }, [hasResults, isLoaded]);

  useEffect(() => {
    if (isLoaded && emptyInputRef.current) emptyInputRef.current.value = isEmpty;
  }, [isEmpty, isLoaded]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isLoaded) return;
    const observer = new ResizeObserver(() => {
      riveRef.current?.resizeDrawingSurfaceToCanvas();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [isLoaded]);

  const setPressed = (pressed: boolean) => {
    if (pressedInputRef.current) pressedInputRef.current.value = pressed;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    tapInputRef.current?.fire();
    setPressed(true);
  };

  return (
    <div
      className={clsx(
        'pointer-events-none absolute inset-x-0 bottom-0 aspect-[602/390] transition-opacity duration-200',
        isLoaded ? 'opacity-100' : 'opacity-0',
        className,
      )}
    >
      <canvas ref={canvasRef} aria-hidden='true' className='absolute inset-0 h-full w-full' />
      {isLoaded && (
        <div
          data-testid='search-pup-hit-area'
          aria-hidden='true'
          onPointerDown={handlePointerDown}
          onPointerUp={() => setPressed(false)}
          onPointerCancel={() => setPressed(false)}
          className='pointer-events-auto absolute z-10 left-[57%] top-[29%] h-[40%] w-[26%] cursor-pointer touch-none'
        />
      )}
    </div>
  );
};

export default SearchBarRive;
