'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alignment, Fit } from '@rive-app/canvas';
import type { LoadedRiveFile } from './file-utils';
import { DropZone } from './drop-zone';
import { InspectorPanel } from './inspector-panel';
import { type PlaybackTarget, useRiveFile } from './use-rive-file';

/** Default playback target for an artboard: prefer a state machine, else the first animation. */
function defaultTarget(artboard: {
  stateMachines: { name: string }[];
  animations: string[];
}): PlaybackTarget | null {
  const sm = artboard.stateMachines[0];
  if (sm) {
    return { kind: 'stateMachine', name: sm.name };
  }
  const animation = artboard.animations[0];
  if (animation) {
    return { kind: 'animation', name: animation };
  }
  return null;
}

export default function RiveViewerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [file, setFile] = useState<LoadedRiveFile | null>(null);
  const [artboardName, setArtboardName] = useState<string | null>(null);
  const [target, setTarget] = useState<PlaybackTarget | null>(null);
  const [fit, setFit] = useState<Fit>(Fit.Contain);
  const [alignment, setAlignment] = useState<Alignment>(Alignment.Center);

  const { status, error, artboards, inputs, isPlaying, play, pause, reset } = useRiveFile({
    canvasRef,
    buffer: file?.buffer ?? null,
    artboard: artboardName,
    target,
    fit,
    alignment,
  });

  const activeArtboard = useMemo(
    () => artboards.find((a) => a.name === artboardName) ?? null,
    [artboards, artboardName],
  );

  // Once the file is parsed, default to its first artboard + sensible target.
  useEffect(() => {
    const first = artboards[0];
    if (first && artboardName === null) {
      setArtboardName(first.name);
      setTarget(defaultTarget(first));
    }
  }, [artboards, artboardName]);

  function openFile(loaded: LoadedRiveFile) {
    setArtboardName(null);
    setTarget(null);
    setFile(loaded);
  }

  function changeArtboard(name: string) {
    const next = artboards.find((a) => a.name === name);
    setArtboardName(name);
    setTarget(next ? defaultTarget(next) : null);
  }

  return (
    <div className='bg-base-200 text-base-content flex h-screen flex-col'>
      <header className='border-base-300 bg-base-100 flex items-center justify-between border-b px-4 py-3'>
        <div>
          <h1 className='text-base font-semibold'>Rive viewer</h1>
          <p className='text-base-content/50 text-xs'>
            Inspect .riv files — artboards, state machines, inputs.
          </p>
        </div>
        {file && <DropZone onLoad={openFile} compact />}
      </header>

      {!file ? (
        <main className='mx-auto w-full max-w-3xl flex-1 p-6'>
          <DropZone onLoad={openFile} />
        </main>
      ) : (
        <main className='flex min-h-0 flex-1'>
          <section className='relative flex min-w-0 flex-1 items-center justify-center bg-[repeating-conic-gradient(theme(colors.base-300)_0_25%,transparent_0_50%)] bg-[length:24px_24px] p-6'>
            <canvas ref={canvasRef} className='h-full w-full' />
            {status === 'loading' && (
              <div className='text-base-content/60 absolute inset-0 flex items-center justify-center text-sm'>
                Loading…
              </div>
            )}
            {status === 'error' && (
              <div className='text-error absolute inset-0 flex items-center justify-center p-6 text-center text-sm'>
                {error}
              </div>
            )}
          </section>
          <InspectorPanel
            file={file}
            artboards={artboards}
            activeArtboard={activeArtboard}
            artboardName={artboardName}
            onArtboardChange={changeArtboard}
            target={target}
            onTargetChange={setTarget}
            fit={fit}
            onFitChange={setFit}
            alignment={alignment}
            onAlignmentChange={setAlignment}
            inputs={inputs}
            isPlaying={isPlaying}
            onPlay={play}
            onPause={pause}
            onReset={reset}
          />
        </main>
      )}
    </div>
  );
}
