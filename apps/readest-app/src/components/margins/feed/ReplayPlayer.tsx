import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { type Level, runCascade } from '@/services/margins/replay/cascade';
import { loadReplay } from '@/services/margins/replay/engine';
import type { Material } from '@/services/margins/replay/material';
import {
  createPlayer,
  drawStill,
  type Player,
  type PlayerArgs,
} from '@/services/margins/replay/player';
import type { Scene } from '@/services/margins/replay/types';

export type Engagement = 'view' | 'completion' | 'replay' | 'your_turn';

export interface ReplayPlayerProps {
  postId: string;
  scene: Scene | null;
  coverUrl: string | null;
  citation: string;
  alt: string;
  material: Material;
  reduced: boolean;
  active: boolean;
  onEngage?(kind: Engagement): void;
  onSound?(step: number, code: number, sfx: [number, string][]): void;
}

const VIEW_MS = 1000;
const BUTTON = 'btn btn-sm btn-ghost bg-base-100/80';

const sizeCanvas = (canvas: HTMLCanvasElement, scene: Scene) => {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.getBoundingClientRect().width || 360;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(((width * scene.page.h) / scene.page.w) * dpr);
};

const ReplayPlayer = ({
  postId,
  scene,
  coverUrl,
  citation,
  alt,
  material,
  reduced,
  active,
  onEngage,
  onSound,
}: ReplayPlayerProps) => {
  const _ = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engage = useRef(onEngage);
  const sound = useRef(onSound);
  const viewed = useRef(false);
  const [level, setLevel] = useState<Level | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [started, setStarted] = useState(!reduced);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);
  const [turned, setTurned] = useState(false);
  const label = `${alt} — ${citation}`;
  engage.current = onEngage;
  sound.current = onSound;

  useEffect(() => {
    let cancelled = false;
    let made: Player | null = null;
    const canvas = canvasRef.current;
    const levels: [Level, () => Promise<Player | null>][] = [];
    if (scene && canvas) {
      sizeCanvas(canvas, scene);
      const args = async (): Promise<PlayerArgs> => ({
        canvas,
        scene,
        Replay: await loadReplay(),
        material,
        color: getComputedStyle(canvas).color || '#000',
        font: scene.page.font.startsWith('SourceSans') ? 'sans-serif' : 'serif',
        reduced,
        onDrift: (step) => console.warn('Margins: replay_drift', postId, step, navigator.userAgent),
        onSound: (step, code) => sound.current?.(step, code, scene.sfx),
        onEnd: () => {
          setEnded(true);
          engage.current?.('completion');
        },
        onTurn: () => {
          setTurned(true);
          engage.current?.('your_turn');
        },
      });
      levels.push(
        ['live', async () => createPlayer({ ...(await args()), mode: 'live' })],
        [
          'interpolated',
          async () => {
            if (scene.checkpoints.length === 0) throw new Error('no checkpoints');
            return createPlayer({ ...(await args()), mode: 'interpolated' });
          },
        ],
        [
          'still',
          async () => {
            drawStill(await args());
            return null;
          },
        ],
      );
    }
    levels.push(
      [
        'cover',
        async () => {
          if (!coverUrl) throw new Error('no cover');
          return null;
        },
      ],
      ['citation', async () => null],
    );
    void runCascade(levels).then(({ level: shown, value }) => {
      if (cancelled) return value?.destroy();
      made = value;
      setLevel(shown);
      setPlayer(value);
    });
    return () => {
      cancelled = true;
      made?.destroy();
    };
  }, [scene, coverUrl, material, reduced, postId]);

  useEffect(() => {
    if (!player) return;
    if (active && started && !paused) player.start();
    else player.pause();
  }, [player, active, started, paused]);

  useEffect(() => {
    if (!active || !level || viewed.current) return;
    const timer = setTimeout(() => {
      viewed.current = true;
      engage.current?.('view');
    }, VIEW_MS);
    return () => clearTimeout(timer);
  }, [active, level]);

  const restart = () => {
    player?.restart();
    setEnded(false);
    setTurned(false);
    engage.current?.('replay');
  };

  const pointer = (kind: 'down' | 'move' | 'up') => (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const r = canvas.getBoundingClientRect();
    if (!player || r.width === 0) return;
    const k = canvas.width / r.width;
    player.pointer(kind, (e.clientX - r.left) * k, (e.clientY - r.top) * k);
  };

  const playing = !!player;
  const showCover = !!coverUrl && (level === 'cover' || (playing && !started));

  return (
    <figure className='relative m-0 w-full overflow-hidden rounded-lg'>
      {scene && (
        <canvas
          ref={canvasRef}
          role='img'
          aria-label={label}
          hidden={level === 'cover' || level === 'citation'}
          className='block w-full touch-none'
          onPointerDown={pointer('down')}
          onPointerMove={pointer('move')}
          onPointerUp={pointer('up')}
        />
      )}
      {showCover && (
        <img
          src={coverUrl!}
          alt={level === 'cover' ? label : ''}
          className={
            level === 'cover' ? 'block w-full' : 'absolute inset-0 h-full w-full object-cover'
          }
        />
      )}
      {level === 'citation' && (
        <div role='img' aria-label={label} className='bg-base-200 p-4 text-sm'>
          <p>{citation}</p>
        </div>
      )}
      <div className='absolute bottom-2 right-2 flex items-center gap-2'>
        {playing && !started && (
          <button type='button' className={BUTTON} onClick={() => setStarted(true)}>
            {_('Play')}
          </button>
        )}
        {playing && started && !ended && (
          <button
            type='button'
            className={BUTTON}
            aria-pressed={paused}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? _('Play') : _('Pause')}
          </button>
        )}
        {ended && (
          <>
            {!turned && (
              <span className='bg-base-100/80 rounded px-2 text-sm'>{_('Your turn')}</span>
            )}
            <button type='button' className={BUTTON} onClick={restart}>
              {_('Restart')}
            </button>
          </>
        )}
      </div>
    </figure>
  );
};

export default ReplayPlayer;
