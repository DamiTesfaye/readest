import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { enterPlay, toast } = vi.hoisted(() => ({ enterPlay: vi.fn(), toast: vi.fn() }));
const host = document.createElement('div');
const view = { renderer: {} } as { renderer: object; parentElement?: HTMLElement };
Object.defineProperty(view, 'parentElement', { get: () => host });

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: {} }) }));
vi.mock('@/services/margins/store', () => ({ openMarginsStore: async () => ({}) }));
vi.mock('@/services/margins/context', () => ({
  marginsContext: () => ({ ready: Promise.resolve() }),
}));
vi.mock('@/store/readerStore', () => ({
  useReaderStore: { getState: () => ({ getView: () => view }) },
}));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: { getState: () => ({ getBookData: () => ({ book: {}, bookDoc: {} }) }) },
}));
vi.mock('@/store/readerProgressStore', () => ({
  useReaderProgressStore: {
    getState: () => ({ progresses: { b1: { index: 3, range: {} } } }),
  },
}));
vi.mock('@/store/customFontStore', () => ({
  useCustomFontStore: { getState: () => ({ getLoadedFonts: () => [] }) },
}));
vi.mock('@/services/margins/play/surfaceSession', async () => {
  class PlayUnavailable extends Error {
    reason: string;
    constructor(reason: string) {
      super(reason);
      this.reason = reason;
    }
  }
  return { enterPlay, PlayUnavailable };
});

import PlaySurface from '@/app/reader/components/play/PlaySurface';
import { PlayUnavailable } from '@/services/margins/play/surfaceSession';
import { eventDispatcher } from '@/utils/event';

const fakeSession = (onExit: () => void) => {
  const state = { active: true, canUndo: false, unit: null, shapeMotion: 'none', font: 'standIn' };
  const exit = vi.fn(onExit);
  return {
    exit,
    tools: { state, exit, addShape: vi.fn(() => 's1'), undo: vi.fn() },
  };
};

describe('PlaySurface', () => {
  beforeEach(() => {
    enterPlay.mockReset();
    toast.mockReset();
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    eventDispatcher.on('toast', toast);
  });

  afterEach(() => {
    eventDispatcher.off('toast', toast);
    cleanup();
    vi.unstubAllGlobals();
  });

  it('enters play for its book, shows the tools and leaves on the exit event', async () => {
    let session: ReturnType<typeof fakeSession> | null = null;
    enterPlay.mockImplementation(async (args: { onExit: () => void }) => {
      session = fakeSession(args.onExit);
      return session;
    });
    render(<PlaySurface bookKey='b1' />);
    await act(() => eventDispatcher.dispatch('margins-play-enter', { bookKey: 'other' }));
    expect(enterPlay).not.toHaveBeenCalled();
    await act(() => eventDispatcher.dispatch('margins-play-enter', { bookKey: 'b1' }));
    expect(enterPlay).toHaveBeenCalledWith(
      expect.objectContaining({ host, index: 3, reduced: true }),
    );
    expect(screen.getByRole('toolbar', { name: 'Play tools' })).toBeTruthy();
    expect(screen.getByText('Play uses a stand-in font')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Circle' }));
    expect(session!.tools.addShape).toHaveBeenCalledWith('circle');
    await act(() => eventDispatcher.dispatch('margins-play-exit', { bookKey: 'b1' }));
    expect(session!.exit).toHaveBeenCalled();
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('says why play is unavailable and stays in read mode', async () => {
    enterPlay.mockRejectedValue(new PlayUnavailable('vertical'));
    render(<PlaySurface bookKey='b1' />);
    await act(() => eventDispatcher.dispatch('margins-play-enter', { bookKey: 'b1' }));
    expect(toast).toHaveBeenLastCalledWith(
      expect.objectContaining({
        detail: { type: 'info', message: "Play isn't available on this page yet: vertical text" },
      }),
    );
    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});
