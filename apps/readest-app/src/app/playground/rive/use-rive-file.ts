'use client';

import { useEffect, useRef, useState } from 'react';
import { Alignment, EventType, Fit, Layout, Rive, type StateMachineInput } from '@rive-app/canvas';
import { configureRiveRuntime } from './rive-runtime';

/** What the runtime should play: a named state machine or a named animation. */
export type PlaybackTarget =
  | { kind: 'stateMachine'; name: string }
  | { kind: 'animation'; name: string };

/** A single state machine in the active artboard, with its inputs. */
export interface ArtboardStateMachine {
  name: string;
  inputs: { name: string; type: number; initialValue?: boolean | number }[];
}

/** Parsed listing of one artboard inside the loaded file. */
export interface ArtboardSummary {
  name: string;
  animations: string[];
  stateMachines: ArtboardStateMachine[];
}

export interface UseRiveFileParams {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** The loaded `.riv` bytes, or null before a file is chosen. */
  buffer: ArrayBuffer | null;
  /** Artboard to render; null lets the runtime pick the file default. */
  artboard: string | null;
  /** What to play; null lets the runtime pick the default. */
  target: PlaybackTarget | null;
  fit: Fit;
  alignment: Alignment;
}

export interface UseRiveFileResult {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  /** Every artboard in the file, available once status is `ready`. */
  artboards: ArtboardSummary[];
  /** Live inputs for the active state machine target (empty otherwise). */
  inputs: StateMachineInput[];
  isPlaying: boolean;
  play: () => void;
  pause: () => void;
  reset: () => void;
}

const targetKey = (t: PlaybackTarget | null) => (t ? `${t.kind}:${t.name}` : 'default');

export function useRiveFile({
  canvasRef,
  buffer,
  artboard,
  target,
  fit,
  alignment,
}: UseRiveFileParams): UseRiveFileResult {
  const riveRef = useRef<Rive | null>(null);
  const [status, setStatus] = useState<UseRiveFileResult['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [artboards, setArtboards] = useState<ArtboardSummary[]>([]);
  const [inputs, setInputs] = useState<StateMachineInput[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  // (Re)instantiate whenever the file or the chosen artboard/target changes.
  // Fit and alignment are applied live in a separate effect below.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !buffer) {
      setStatus('idle');
      return;
    }

    configureRiveRuntime();
    setStatus('loading');
    setError(null);
    setInputs([]);

    let disposed = false;
    const rive = new Rive({
      canvas,
      buffer,
      autoplay: true,
      ...(artboard ? { artboard } : {}),
      ...(target?.kind === 'stateMachine' ? { stateMachines: target.name } : {}),
      ...(target?.kind === 'animation' ? { animations: target.name } : {}),
      layout: new Layout({ fit, alignment }),
      onLoad: () => {
        if (disposed) return;
        rive.resizeDrawingSurfaceToCanvas();
        const contents = rive.contents;
        setArtboards(
          (contents?.artboards ?? []).map((a) => ({
            name: a.name,
            animations: a.animations,
            stateMachines: a.stateMachines.map((sm) => ({
              name: sm.name,
              inputs: sm.inputs.map((i) => ({
                name: i.name,
                type: i.type,
                initialValue: i.initialValue,
              })),
            })),
          })),
        );
        if (target?.kind === 'stateMachine') {
          setInputs(rive.stateMachineInputs(target.name) ?? []);
        }
        setIsPlaying(rive.isPlaying);
        setStatus('ready');
      },
      onLoadError: () => {
        if (disposed) return;
        setError('Failed to load this .riv file. It may be corrupt or an unsupported version.');
        setStatus('error');
      },
    });
    riveRef.current = rive;
    rive.on(EventType.Play, () => !disposed && setIsPlaying(true));
    rive.on(EventType.Pause, () => !disposed && setIsPlaying(false));
    rive.on(EventType.Stop, () => !disposed && setIsPlaying(false));

    return () => {
      disposed = true;
      rive.cleanup();
      if (riveRef.current === rive) riveRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer, artboard, targetKey(target)]);

  // Apply fit/alignment to the live instance without re-instantiating.
  useEffect(() => {
    const rive = riveRef.current;
    if (!rive || status !== 'ready') return;
    rive.layout = new Layout({ fit, alignment });
    rive.resizeDrawingSurfaceToCanvas();
  }, [fit, alignment, status]);

  // Keep the drawing surface matched to the canvas's rendered size.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      riveRef.current?.resizeDrawingSurfaceToCanvas();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [canvasRef]);

  return {
    status,
    error,
    artboards,
    inputs,
    isPlaying,
    play: () => riveRef.current?.play(),
    pause: () => riveRef.current?.pause(),
    reset: () => {
      const rive = riveRef.current;
      if (!rive) return;
      rive.reset({
        artboard: artboard ?? undefined,
        stateMachines: target?.kind === 'stateMachine' ? target.name : undefined,
        animations: target?.kind === 'animation' ? target.name : undefined,
        autoplay: true,
      });
    },
  };
}
