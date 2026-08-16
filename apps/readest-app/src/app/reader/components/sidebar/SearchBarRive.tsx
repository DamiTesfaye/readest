'use client';

import clsx from 'clsx';
import React, { useEffect, useRef, useState } from 'react';
import type { Rive as RiveInstance, StateMachineInput } from '@rive-app/canvas';

const RIVE_SRC = '/rive/searchbar.riv';
const RIVE_WASM_SRC = '/rive/rive.wasm';
const RIVE_WASM_FALLBACK_SRC = '/rive/rive_fallback.wasm';
const STATE_MACHINE = 'State Machine 1';
const HOVER_INPUT = 'searchHover';
const LOOK_X_INPUT = 'lookX';
const IS_TYPING_INPUT = 'isTyping';

let runtimeConfigured = false;

interface SearchBarRiveProps {
  engaged: boolean;
  lookX?: number;
  isTyping?: boolean;
  className?: string;
}

const SearchBarRive: React.FC<SearchBarRiveProps> = ({
  engaged,
  lookX = 0,
  isTyping = false,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const riveRef = useRef<RiveInstance | null>(null);
  const hoverInputRef = useRef<StateMachineInput | null>(null);
  const lookXInputRef = useRef<StateMachineInput | null>(null);
  const isTypingInputRef = useRef<StateMachineInput | null>(null);
  const engagedRef = useRef(engaged);
  const lookRef = useRef({ lookX, isTyping });
  const [isLoaded, setIsLoaded] = useState(false);

  engagedRef.current = engaged;
  lookRef.current = { lookX, isTyping };

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
        autoplay: true,
        stateMachines: STATE_MACHINE,
        layout: new Layout({ fit: Fit.Fill, alignment: Alignment.Center }),
        onLoad: () => {
          if (disposed) return;
          rive.resizeDrawingSurfaceToCanvas();
          const inputs = rive.stateMachineInputs(STATE_MACHINE) ?? [];
          const findInput = (name: string) => inputs.find((i) => i.name === name) ?? null;
          hoverInputRef.current = findInput(HOVER_INPUT);
          lookXInputRef.current = findInput(LOOK_X_INPUT);
          isTypingInputRef.current = findInput(IS_TYPING_INPUT);
          if (hoverInputRef.current) hoverInputRef.current.value = engagedRef.current;
          if (lookXInputRef.current) lookXInputRef.current.value = lookRef.current.lookX;
          if (isTypingInputRef.current) isTypingInputRef.current.value = lookRef.current.isTyping;
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
      lookXInputRef.current = null;
      isTypingInputRef.current = null;
      riveRef.current?.cleanup();
      riveRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (hoverInputRef.current) hoverInputRef.current.value = engaged;
  }, [engaged]);

  useEffect(() => {
    if (lookXInputRef.current) lookXInputRef.current.value = lookX;
  }, [lookX]);

  useEffect(() => {
    if (isTypingInputRef.current) isTypingInputRef.current.value = isTyping;
  }, [isTyping]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isLoaded) return;
    const observer = new ResizeObserver(() => {
      riveRef.current?.resizeDrawingSurfaceToCanvas();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [isLoaded]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden='true'
      className={clsx(
        'pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-200',
        isLoaded ? 'opacity-100' : 'opacity-0',
        className,
      )}
    />
  );
};

export default SearchBarRive;
