'use client';

import { useReducer } from 'react';
import { Alignment, Fit, type StateMachineInput } from '@rive-app/canvas';
import type { LoadedRiveFile } from './file-utils';
import { formatBytes } from './file-utils';
import type { ArtboardSummary, PlaybackTarget } from './use-rive-file';

// StateMachineInputType values from the runtime (see rive.d.ts).
const INPUT_NUMBER = 56;
const INPUT_TRIGGER = 58;
const INPUT_BOOLEAN = 59;

interface InspectorPanelProps {
  file: LoadedRiveFile;
  artboards: ArtboardSummary[];
  activeArtboard: ArtboardSummary | null;
  artboardName: string | null;
  onArtboardChange: (name: string) => void;
  target: PlaybackTarget | null;
  onTargetChange: (target: PlaybackTarget) => void;
  fit: Fit;
  onFitChange: (fit: Fit) => void;
  alignment: Alignment;
  onAlignmentChange: (alignment: Alignment) => void;
  inputs: StateMachineInput[];
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className='flex flex-col gap-1 text-sm'>
      <span className='text-base-content/60 text-xs font-medium uppercase tracking-wide'>
        {label}
      </span>
      {children}
    </label>
  );
}

const selectClass =
  'eink-bordered border-base-300 bg-base-100 rounded-md border px-2 py-1.5 text-sm';

export function InspectorPanel(props: InspectorPanelProps) {
  const {
    file,
    artboards,
    activeArtboard,
    artboardName,
    onArtboardChange,
    target,
    onTargetChange,
    fit,
    onFitChange,
    alignment,
    onAlignmentChange,
    inputs,
    isPlaying,
    onPlay,
    onPause,
    onReset,
  } = props;

  const stateMachines = activeArtboard?.stateMachines ?? [];
  const animations = activeArtboard?.animations ?? [];
  const targetValue = target ? `${target.kind}:${target.name}` : '';

  return (
    <div className='border-base-300 bg-base-100 flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l p-4'>
      <div>
        <p className='text-base-content truncate text-sm font-semibold' title={file.name}>
          {file.name}
        </p>
        <p className='text-base-content/50 text-xs'>
          {formatBytes(file.size)} · {artboards.length} artboard
          {artboards.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className='flex items-center gap-2'>
        <button
          type='button'
          onClick={isPlaying ? onPause : onPlay}
          className='btn-primary eink-bordered flex-1 rounded-md px-3 py-1.5 text-sm font-medium'
        >
          {isPlaying ? '⏸ Pause' : '▶ Play'}
        </button>
        <button
          type='button'
          onClick={onReset}
          className='border-base-300 hover:bg-base-200 eink-bordered rounded-md border px-3 py-1.5 text-sm'
        >
          ↺ Reset
        </button>
      </div>

      <Field label='Artboard'>
        <select
          className={selectClass}
          value={artboardName ?? ''}
          onChange={(e) => onArtboardChange(e.target.value)}
        >
          {artboards.map((a) => (
            <option key={a.name} value={a.name}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label='Animation / State machine'>
        <select
          className={selectClass}
          value={targetValue}
          onChange={(e) => {
            const [kind, ...rest] = e.target.value.split(':');
            const name = rest.join(':');
            onTargetChange({ kind: kind as PlaybackTarget['kind'], name });
          }}
        >
          {stateMachines.length > 0 && (
            <optgroup label='State machines'>
              {stateMachines.map((sm) => (
                <option key={`sm:${sm.name}`} value={`stateMachine:${sm.name}`}>
                  {sm.name}
                </option>
              ))}
            </optgroup>
          )}
          {animations.length > 0 && (
            <optgroup label='Animations'>
              {animations.map((name) => (
                <option key={`an:${name}`} value={`animation:${name}`}>
                  {name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </Field>

      <div className='grid grid-cols-2 gap-3'>
        <Field label='Fit'>
          <select
            className={selectClass}
            value={fit}
            onChange={(e) => onFitChange(e.target.value as Fit)}
          >
            {Object.values(Fit).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field label='Alignment'>
          <select
            className={selectClass}
            value={alignment}
            onChange={(e) => onAlignmentChange(e.target.value as Alignment)}
          >
            {Object.values(Alignment).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {target?.kind === 'stateMachine' && (
        <div className='flex flex-col gap-3'>
          <span className='text-base-content/60 text-xs font-medium uppercase tracking-wide'>
            Inputs
          </span>
          {inputs.length === 0 ? (
            <p className='text-base-content/40 text-xs'>No inputs on this state machine.</p>
          ) : (
            inputs.map((input) => <InputControl key={input.name} input={input} />)
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A control bound to a single live `StateMachineInput`. Mutating `input.value`
 * (or calling `input.fire()`) reaches into the running runtime; a local
 * force-update keeps the control's displayed value in sync.
 */
function InputControl({ input }: { input: StateMachineInput }) {
  const [, forceUpdate] = useReducer((n: number) => n + 1, 0);

  if (input.type === INPUT_BOOLEAN) {
    return (
      <label className='flex items-center justify-between gap-2 text-sm'>
        <span className='truncate' title={input.name}>
          {input.name}
        </span>
        <input
          type='checkbox'
          checked={Boolean(input.value)}
          onChange={(e) => {
            input.value = e.target.checked;
            forceUpdate();
          }}
        />
      </label>
    );
  }

  if (input.type === INPUT_NUMBER) {
    return (
      <label className='flex flex-col gap-1 text-sm'>
        <span className='flex justify-between'>
          <span className='truncate' title={input.name}>
            {input.name}
          </span>
          <span className='text-base-content/50 tabular-nums'>{Number(input.value)}</span>
        </span>
        <input
          type='number'
          value={Number(input.value)}
          onChange={(e) => {
            input.value = Number(e.target.value);
            forceUpdate();
          }}
          className='eink-bordered border-base-300 bg-base-100 rounded-md border px-2 py-1'
        />
      </label>
    );
  }

  if (input.type === INPUT_TRIGGER) {
    return (
      <button
        type='button'
        onClick={() => input.fire()}
        className='border-base-300 hover:bg-base-200 eink-bordered rounded-md border px-3 py-1.5 text-left text-sm'
      >
        ⚡ {input.name}
      </button>
    );
  }

  return null;
}
