import { RefObject, useEffect, useRef, useState } from 'react';
import type { Rive as RiveInstance } from '@rive-app/canvas';
import { loadRuntime } from '@/components/sparkrive/useSparkRive';

const RIVE_SRC = '/rive/moving-pictures.riv';
const STATE_MACHINE = 'Motion';
const HOVER_PROPERTY = 'hover';

type Rgb = readonly [number, number, number];

const COLORED_PALETTE: Record<string, Rgb> = {
  ball: [0x00, 0x7a, 0xff],
  puff: [0x00, 0x7a, 0xff],
  marks: [0x02, 0x02, 0x88],
};

const MUTED_PALETTE: Record<string, Rgb> = {
  ball: [0xfc, 0xfc, 0xfc],
  puff: [0xfc, 0xfc, 0xfc],
  marks: [0x99, 0x99, 0x99],
};

const applyPalette = (rive: RiveInstance, colored: boolean) => {
  const palette = colored ? COLORED_PALETTE : MUTED_PALETTE;
  for (const [name, [r, g, b]] of Object.entries(palette)) {
    rive.viewModelInstance?.color(name)?.rgb(r, g, b);
  }
};

interface MotionRiveOptions {
  colored: boolean;
  hovered: boolean;
}

export const useMotionRive = (
  canvasRef: RefObject<HTMLCanvasElement | null>,
  { colored, hovered }: MotionRiveOptions,
): boolean => {
  const riveRef = useRef<RiveInstance | null>(null);
  const coloredRef = useRef(colored);
  coloredRef.current = colored;
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let disposed = false;

    const load = async () => {
      const [runtime, response] = await Promise.all([loadRuntime(), fetch(RIVE_SRC)]);
      if (!response.ok) throw new Error(`${response.status} loading ${RIVE_SRC}`);
      const buffer = await response.arrayBuffer();
      const canvas = canvasRef.current;
      if (disposed || !canvas) return;

      const { Rive, Layout, Fit, Alignment } = runtime;
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
          applyPalette(rive, coloredRef.current);
          rive.resizeDrawingSurfaceToCanvas();
          rive.play();
          setIsLoaded(true);
        },
      });
      riveRef.current = rive;
    };

    load().catch((error) => {
      console.warn(`Moving Pictures animation unavailable (${RIVE_SRC}):`, error);
    });

    return () => {
      disposed = true;
      riveRef.current?.cleanup();
      riveRef.current = null;
      setIsLoaded(false);
    };
  }, [canvasRef]);

  useEffect(() => {
    if (riveRef.current && isLoaded) applyPalette(riveRef.current, colored);
  }, [colored, isLoaded]);

  useEffect(() => {
    const flag = riveRef.current?.viewModelInstance?.boolean(HOVER_PROPERTY);
    if (flag && isLoaded) flag.value = hovered;
  }, [hovered, isLoaded]);

  return isLoaded;
};
