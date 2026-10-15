import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerArgs } from '@/services/margins/replay/player';
import type { Scene } from '@/services/margins/replay/types';

const { createPlayer, drawStill, player, lastArgs } = vi.hoisted(() => {
  const player = {
    start: vi.fn(),
    pause: vi.fn(),
    restart: vi.fn(),
    destroy: vi.fn(),
    pointer: vi.fn(),
    ended: false,
    drifts: 0,
    mode: 'live',
  };
  const lastArgs = { current: null as PlayerArgs | null };
  const createPlayer = vi.fn((args: PlayerArgs) => {
    lastArgs.current = args;
    return player;
  });
  return { createPlayer, drawStill: vi.fn(), player, lastArgs };
});

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/services/margins/replay/engine', () => ({
  BOX_STRIDE: 5,
  loadReplay: async () => class {},
}));
vi.mock('@/services/margins/replay/player', () => ({ createPlayer, drawStill }));

import ReplayPlayer from '@/components/margins/feed/ReplayPlayer';

const scene = {
  checkpoints: [[600, 1, [0]]],
  sfx: [],
  page: { w: 20, h: 30, font: 'x' },
} as unknown as Scene;

const props = {
  postId: 'pst_1',
  scene,
  coverUrl: 'https://cdn.test/cover.webp',
  citation: 'Meditations, Book II',
  alt: 'A sun pushes the words aside',
  material: { kind: 'ghost' } as const,
  reduced: false,
  active: true,
};

const settle = () => act(async () => {});

describe('ReplayPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastArgs.current = null;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows the cover with a Play button under reduced motion and does not start', async () => {
    render(<ReplayPlayer {...props} reduced />);
    await settle();
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    expect(document.querySelector('img')?.getAttribute('src')).toBe(props.coverUrl);
    expect(player.start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(player.start).toHaveBeenCalled();
  });

  it('is named by its description and citation', async () => {
    render(<ReplayPlayer {...props} />);
    await settle();
    expect(
      screen.getByRole('img', { name: 'A sun pushes the words aside — Meditations, Book II' }),
    ).toBeTruthy();
  });

  it('offers Your turn and Restart after the end', async () => {
    const onEngage = vi.fn();
    render(<ReplayPlayer {...props} onEngage={onEngage} />);
    await settle();
    act(() => lastArgs.current!.onEnd!());
    expect(screen.getByText('Your turn')).toBeTruthy();
    expect(onEngage).toHaveBeenCalledWith('completion');
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }));
    expect(player.restart).toHaveBeenCalled();
    expect(onEngage).toHaveBeenCalledWith('replay');
    expect(screen.queryByText('Your turn')).toBeNull();
  });

  it('hides Your turn once the viewer takes it and keeps Restart', async () => {
    const onEngage = vi.fn();
    render(<ReplayPlayer {...props} onEngage={onEngage} />);
    await settle();
    act(() => lastArgs.current!.onEnd!());
    act(() => lastArgs.current!.onTurn!());
    expect(onEngage).toHaveBeenCalledWith('your_turn');
    expect(screen.queryByText('Your turn')).toBeNull();
    screen.getByRole('button', { name: 'Restart' });
  });

  it('shows Pause again when the card loops', async () => {
    render(<ReplayPlayer {...props} />);
    await settle();
    act(() => lastArgs.current!.onEnd!());
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    act(() => lastArgs.current!.onRestart!());
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(screen.queryByText('Your turn')).toBeNull();
  });

  it('pauses and resumes', async () => {
    render(<ReplayPlayer {...props} />);
    await settle();
    const toggle = screen.getByRole('button', { name: 'Pause' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    player.start.mockClear();
    fireEvent.click(toggle);
    expect(player.pause).toHaveBeenCalled();
    const resume = screen.getByRole('button', { name: 'Play' });
    expect(resume.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(resume);
    expect(player.start).toHaveBeenCalled();
  });

  it('does not loop under reduced motion', async () => {
    vi.useFakeTimers();
    render(<ReplayPlayer {...props} reduced />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(lastArgs.current!.reduced).toBe(true);
    act(() => lastArgs.current!.onEnd!());
    await act(async () => vi.advanceTimersByTime(3000));
    expect(player.restart).not.toHaveBeenCalled();
  });

  it('counts a view after a second of being active, and pauses when inactive', async () => {
    vi.useFakeTimers();
    const onEngage = vi.fn();
    const { rerender } = render(<ReplayPlayer {...props} onEngage={onEngage} />);
    await settle();
    await act(async () => vi.advanceTimersByTime(1000));
    expect(onEngage).toHaveBeenCalledWith('view');
    player.pause.mockClear();
    rerender(<ReplayPlayer {...props} onEngage={onEngage} active={false} />);
    expect(player.pause).toHaveBeenCalled();
  });

  it('logs a drift with the post, step and user agent only', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<ReplayPlayer {...props} />);
    await settle();
    lastArgs.current!.onDrift!(600);
    expect(warn).toHaveBeenCalledWith('Margins: replay_drift', 'pst_1', 600, navigator.userAgent);
    warn.mockRestore();
  });

  it('renders the citation card with no scene and no cover', async () => {
    render(<ReplayPlayer {...props} scene={null} coverUrl={null} />);
    await settle();
    expect(screen.getByText('Meditations, Book II')).toBeTruthy();
    expect(document.querySelector('canvas')).toBeNull();
    expect(createPlayer).not.toHaveBeenCalled();
  });

  it('falls back to the cover when the replay cannot start', async () => {
    const fail = () => {
      throw new Error('bad scene');
    };
    createPlayer.mockImplementationOnce(fail).mockImplementationOnce(fail);
    drawStill.mockImplementationOnce(fail);
    render(<ReplayPlayer {...props} />);
    await settle();
    expect(screen.getByRole('img', { name: /Meditations, Book II/ }).tagName).toBe('IMG');
  });

  it('schedules nothing muted, and only effects still ahead once unmuted', async () => {
    const sfx = { schedule: vi.fn(), stop: vi.fn() };
    const withSfx = {
      ...scene,
      seed: 7,
      sfx: [
        [10, 'pop-1'],
        [20, 'tick-1'],
      ],
    } as unknown as Scene;
    const { rerender } = render(<ReplayPlayer {...props} scene={withSfx} sfx={null} />);
    await settle();
    lastArgs.current!.onSound!(10, -1, 10);
    lastArgs.current!.onSound!(12, 1, 12);
    expect(sfx.schedule).not.toHaveBeenCalled();
    rerender(<ReplayPlayer {...props} scene={withSfx} sfx={sfx} />);
    lastArgs.current!.onSound!(20, -2, 19);
    lastArgs.current!.onSound!(30, 1, 31);
    expect(sfx.schedule.mock.calls).toEqual([
      ['tick-1', 20, 19],
      ['thud-3', 30, 31],
    ]);
  });
});
