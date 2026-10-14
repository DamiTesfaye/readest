import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Placement } from '@/services/margins/painter';
import type { LayerRow } from '@/services/margins/store';
import type { Anchor } from '@/services/margins/types';
import { eventDispatcher } from '@/utils/event';

const h = vi.hoisted(() => ({
  rows: [] as LayerRow[],
  placements: new Map<string, Placement>(),
  session: null as unknown,
  display: 'full' as string,
  view: { goTo: vi.fn(async () => {}), getCFI: vi.fn(() => 'epubcfi(/6/4!/4/2)') },
  saveViewSettings: vi.fn(),
  retryMargin: vi.fn(async () => {}),
  editMargin: vi.fn(async () => {}),
  scheduleDelete: vi.fn(() => ({ undo: vi.fn(), flush: vi.fn() })),
  createAnchor: vi.fn(async () => ({ quote: { exact: 'new' } })),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, opts?: Record<string, string | number>) =>
    opts ? s.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(opts[key] ?? '')) : s,
}));
vi.mock('@/hooks/useTranslator', () => ({ useTranslator: () => ({ translate: vi.fn() }) }));
vi.mock('@/context/EnvContext', () => {
  const env = { envConfig: {}, appService: {} };
  return { useEnv: () => env };
});
vi.mock('@/components/ToolbarPopover', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
vi.mock('@/store/readerStore', () => {
  const state = {
    getView: () => h.view,
    getViewSettings: () => ({ marginsDisplay: h.display }),
  };
  const useReaderStore = (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state);
  return { useReaderStore };
});
vi.mock('@/store/bookDataStore', () => {
  const data = { book: { hash: 'h1', format: 'EPUB', title: 'Alice' }, bookDoc: {} };
  const state = { getBookData: () => data };
  const useBookDataStore = (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state);
  return { useBookDataStore };
});
vi.mock('@/helpers/settings', () => ({ saveViewSettings: h.saveViewSettings }));
vi.mock('@/services/ampleread/auth/session', () => ({ getSession: async () => h.session }));
vi.mock('@/services/margins/store', () => ({
  openMarginsStore: async () => ({
    layersForReader: async () => h.rows,
    getAsset: async () => null,
    assetByRemote: async () => null,
  }),
}));
vi.mock('@/services/margins/sync', () => ({ cachedLink: () => null }));
vi.mock('@/services/margins/texts', () => ({ readerTextIds: async () => [] }));
vi.mock('@/services/margins/context', () => ({
  marginsContext: () => ({}),
  refreshCapped: async () => true,
}));
vi.mock('@/services/margins/anchorBridge', () => ({
  liveRange: async () => {
    const r = document.createRange();
    r.selectNodeContents(document.body);
    return r;
  },
  createAnchor: h.createAnchor,
}));
vi.mock('@/services/margins/margins', () => ({
  hiddenMargins: () => new Set(),
  onMarginsChanged: () => () => {},
  retryMargin: h.retryMargin,
  editMargin: h.editMargin,
  scheduleDelete: h.scheduleDelete,
}));
vi.mock('@/app/reader/hooks/useMarginsPainter', () => ({
  getMarginsPainter: () => ({ placements: () => h.placements }),
  MARGINS_PLACED_EVENT: 'margins-placed',
}));

import MarginsPopover from '@/app/reader/components/margins/MarginsPopover';

const row = (id: string, quote: string, o: Partial<LayerRow> = {}): LayerRow => ({
  id,
  fileHash: 'h1',
  textId: null,
  anchor: { quote: { exact: quote } } as unknown as Anchor,
  kind: 'clip',
  payload: { v: 1, ground: 'paper', quote: { frame: {}, size: 'm' }, elements: [] },
  rev: 1,
  deleted: false,
  ...o,
});

const open = async () => {
  render(<MarginsPopover bookKey='b1' isOpen anchorEl={null} onClose={vi.fn()} />);
  await act(async () => {});
};

beforeEach(() => {
  h.rows = [
    row('late', 'late passage'),
    row('early', 'early passage'),
    row('other', 'removed passage'),
    row('lost', 'lost passage'),
    row('moved', 'moved passage'),
  ];
  h.placements = new Map<string, Placement>([
    ['late', { kind: 'placed', section: 2, start: 5, end: 9, step: 1 }],
    ['early', { kind: 'placed', section: 1, start: 50, end: 60, step: 2 }],
    ['moved', { kind: 'placed', section: 2, start: 1, end: 3, step: 3 }],
    ['other', { kind: 'elsewhere' }],
    ['lost', { kind: 'detached' }],
  ]);
  h.session = { me: { id: 'u1' } };
  h.display = 'full';
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('MarginsPopover', () => {
  it('lists placed Margins in reading order, then other editions, then unplaced', async () => {
    await open();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(items.map((t) => t.match(/(early|moved|late|removed|lost) passage/)?.[1])).toEqual([
      'early',
      'moved',
      'late',
      'removed',
      'lost',
    ]);
    screen.getByRole('heading', { name: 'From another edition' });
    screen.getByText('1 Margin on a passage not in your edition');
    screen.getByRole('heading', { name: "Couldn't place" });
    const lost = screen.getAllByRole('listitem')[4]!;
    within(lost).getByText("We couldn't find this passage in your copy.");
    within(lost).getByRole('button', { name: 'Delete' });
    within(lost).getByRole('button', { name: 'Open card' });
  });

  it('goes to a passage by keyboard and focuses the opened card', async () => {
    await open();
    const first = screen.getAllByRole('listitem')[0]!;
    const go = within(first).getByRole('button', { name: 'Go to passage' });
    expect(go.getAttribute('tabindex')).toBeNull();
    await act(async () => fireEvent.click(go));
    expect(h.view.goTo).toHaveBeenCalledWith(1);
    expect(h.view.goTo).toHaveBeenCalledWith('epubcfi(/6/4!/4/2)');
    expect(document.activeElement?.getAttribute('role')).toBe('article');
    expect(first.contains(document.activeElement)).toBe(true);
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain('early passage');
  });

  it('switches the display through a three-option radiogroup', async () => {
    await open();
    const group = screen.getByRole('radiogroup', { name: 'Show Margins' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual(['Full', 'Markers', 'Quiet']);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    fireEvent.click(radios[1]!);
    expect(h.saveViewSettings).toHaveBeenCalledWith(
      {},
      'b1',
      'marginsDisplay',
      'markers',
      false,
      false,
    );
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
  });

  it('still goes to the passage in quiet', async () => {
    h.display = 'quiet';
    await open();
    const first = screen.getAllByRole('listitem')[0]!;
    await act(async () =>
      fireEvent.click(within(first).getByRole('button', { name: 'Go to passage' })),
    );
    expect(h.view.goTo).toHaveBeenCalledWith('epubcfi(/6/4!/4/2)');
    expect(document.activeElement?.getAttribute('role')).toBe('article');
  });

  it('shows the error badge with Retry', async () => {
    h.rows = [row('bad', 'bad passage', { error: 'invalid_payload', rev: null })];
    h.placements = new Map([['bad', { kind: 'placed', section: 0, start: 0, end: 1, step: 1 }]]);
    await open();
    screen.getByText("This Margin couldn't sync. Edit it to try again.");
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry' })));
    expect(h.retryMargin).toHaveBeenCalledWith(expect.anything(), 'bad');
  });

  it('plays the current page from the Play button and closes', async () => {
    const dispatch = vi.spyOn(eventDispatcher, 'dispatch').mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<MarginsPopover bookKey='b1' isOpen anchorEl={null} onClose={onClose} />);
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onClose).toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith('margins-play-enter', { bookKey: 'b1' });
    dispatch.mockRestore();
  });

  it('shows the sign-in banner when signed out', async () => {
    h.session = null;
    await open();
    screen.getByText('Sign in to keep your Margins on all your devices.');
  });

  it('offers Keep here on a fuzzy placement', async () => {
    await open();
    screen.getByText('This Margin moved slightly.');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Keep here' })));
    expect(h.createAnchor).toHaveBeenCalled();
    expect(h.editMargin).toHaveBeenCalledWith(expect.anything(), 'moved', {
      anchor: { quote: { exact: 'new' } },
    });
  });

  it('deletes with an undo', async () => {
    await open();
    const first = screen.getAllByRole('listitem')[0]!;
    await act(async () => fireEvent.click(within(first).getByRole('button', { name: 'Delete' })));
    expect(h.scheduleDelete).toHaveBeenCalledWith(expect.anything(), 'early');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const handle = h.scheduleDelete.mock.results[0]!.value as { undo: () => void };
    expect(handle.undo).toHaveBeenCalled();
  });
});
