import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { enterPlay, toast, viewSettings, bookData, ready } = vi.hoisted(() => ({
  enterPlay: vi.fn(),
  toast: vi.fn(),
  viewSettings: { current: {} as Record<string, unknown> },
  bookData: { current: { book: {}, bookDoc: {} } as Record<string, unknown> },
  ready: { current: Promise.resolve() as Promise<void> },
}));
const host = document.createElement('div');
const view = { renderer: {} } as { renderer: object; parentElement?: HTMLElement };
Object.defineProperty(view, 'parentElement', { get: () => host });

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: {} }) }));
vi.mock('@/services/margins/store', () => ({ openMarginsStore: async () => ({}) }));
vi.mock('@/services/margins/context', () => ({
  marginsContext: () => ({ ready: ready.current }),
}));
vi.mock('@/store/readerStore', () => ({
  useReaderStore: {
    getState: () => ({ getView: () => view, getViewSettings: () => viewSettings.current }),
  },
}));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ settings: { globalViewSettings: {} } }) },
}));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: { getState: () => ({ getBookData: () => bookData.current }) },
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
    tools: { state, exit, addShape: vi.fn(() => 's1'), undo: vi.fn(), keep: vi.fn() },
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
    bookData.current = { book: {}, bookDoc: {} };
    ready.current = Promise.resolve();
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

  it('notes that play shows the original text while text transforms are on', async () => {
    enterPlay.mockImplementation(async (args: { onExit: () => void }) => fakeSession(args.onExit));
    const note = "Play shows the book's original text, without your text changes";
    viewSettings.current = {
      convertChineseVariant: 'none',
      proofreadRules: [{ enabled: true, pattern: 'x', onlyForTTS: true }],
    };
    const { unmount } = render(<PlaySurface bookKey='b1' />);
    await act(() => eventDispatcher.dispatch('margins-play-enter', { bookKey: 'b1' }));
    expect(screen.queryByText(note)).toBeNull();
    unmount();
    viewSettings.current = { convertChineseVariant: 's2t' };
    render(<PlaySurface bookKey='b1' />);
    await act(() => eventDispatcher.dispatch('margins-play-enter', { bookKey: 'b1' }));
    expect(screen.getByText(note)).toBeTruthy();
    viewSettings.current = {};
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
  it('says a fixed-layout book cannot play instead of waiting for Margins to load it', async () => {
    bookData.current = { book: {}, bookDoc: {}, isFixedLayout: true };
    ready.current = new Promise(() => {});
    render(<PlaySurface bookKey='b1' />);
    await act(() => eventDispatcher.dispatch('margins-play-enter', { bookKey: 'b1' }));
    expect(toast).toHaveBeenLastCalledWith(
      expect.objectContaining({
        detail: { type: 'info', message: "Play isn't available on this page yet: fixed layout" },
      }),
    );
    expect(enterPlay).not.toHaveBeenCalled();
  });

  it('keeps with a required description and shows refusals in place', async () => {
    let session: ReturnType<typeof fakeSession> | null = null;
    enterPlay.mockImplementation(async (args: { onExit: () => void }) => {
      session = fakeSession(args.onExit);
      return session;
    });
    const panel = vi.fn();
    eventDispatcher.on('margins-open-panel', panel);
    render(<PlaySurface bookKey='b1' />);
    await act(() => eventDispatcher.dispatch('margins-play-enter', { bookKey: 'b1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    const dialog = screen.getByRole('dialog', { name: 'Keep this play' });
    const keep = () => fireEvent.submit(dialog);
    expect(within(dialog).getByRole('button', { name: 'Keep' }).hasAttribute('disabled')).toBe(
      true,
    );
    fireEvent.change(screen.getByLabelText('Describe this play for screen readers'), {
      target: { value: ' A sun pushes the words aside ' },
    });
    session!.tools.keep.mockResolvedValueOnce({ ok: false, reason: 'quota' });
    await act(async () => keep());
    expect(session!.tools.keep).toHaveBeenCalledWith('A sun pushes the words aside');
    expect(within(dialog).getByRole('status').textContent).toMatch(/3,000 characters/);
    fireEvent.click(screen.getByRole('button', { name: 'Manage Margins' }));
    expect(panel).toHaveBeenCalled();
    session!.tools.keep.mockResolvedValueOnce({ ok: true, layerId: 'lyr_1', dropped: 1 });
    await act(async () => keep());
    expect(toast.mock.calls.map((c) => c[0].detail.message)).toEqual([
      'Kept as a private Margin.',
      "Some loose words were outside the kept passage and won't replay.",
    ]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('toolbar')).toBeTruthy();
    eventDispatcher.off('margins-open-panel', panel);
  });
  it('says when a kept play replays only its first minute or has no replay', async () => {
    let session: ReturnType<typeof fakeSession> | null = null;
    enterPlay.mockImplementation(async (args: { onExit: () => void }) => {
      session = fakeSession(args.onExit);
      return session;
    });
    render(<PlaySurface bookKey='b1' />);
    await act(() => eventDispatcher.dispatch('margins-play-enter', { bookKey: 'b1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    fireEvent.change(screen.getByLabelText('Describe this play for screen readers'), {
      target: { value: 'A long play' },
    });
    session!.tools.keep.mockResolvedValueOnce({
      ok: true,
      layerId: 'lyr_1',
      truncated: true,
      scene: 'failed',
    });
    await act(async () => fireEvent.submit(screen.getByRole('dialog', { name: 'Keep this play' })));
    expect(toast.mock.calls.map((c) => c[0].detail.message)).toEqual([
      'Kept as a private Margin.',
      'Replays show the first minute.',
      "This Play couldn't be saved for replay",
    ]);
  });
});
