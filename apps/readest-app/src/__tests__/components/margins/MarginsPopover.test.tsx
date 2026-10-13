import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Placement } from '@/services/margins/painter';
import type { LayerRow } from '@/services/margins/store';
import { PublicApiError } from '@/services/margins/public/api';
import type { Anchor } from '@/services/margins/types';
import { eventDispatcher } from '@/utils/event';

const h = vi.hoisted(() => ({
  rows: [] as LayerRow[],
  placements: new Map<string, Placement>(),
  session: null as unknown,
  display: 'full' as string,
  view: {
    goTo: vi.fn(async () => {}),
    getCFI: vi.fn(() => 'epubcfi(/6/4!/4/2)'),
    renderer: { getContents: () => [{ index: 1 }, { index: 2 }] },
  },
  clusters: new Map<number, unknown[]>(),
  openPassage: vi.fn(async () => {}),
  saveViewSettings: vi.fn(),
  retryMargin: vi.fn(async () => {}),
  editMargin: vi.fn(async () => {}),
  scheduleDelete: vi.fn(() => ({ undo: vi.fn(), flush: vi.fn() })),
  createAnchor: vi.fn(async () => ({ quote: { exact: 'new' } })),
  flag: false,
  myPosts: [] as unknown[],
  appeal: vi.fn(),
  unpublish: vi.fn(async () => ({})),
  ask: vi.fn(async () => true),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, opts?: Record<string, string | number>) =>
    opts ? s.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(opts[key] ?? '')) : s,
}));
vi.mock('@/hooks/useTranslator', () => ({ useTranslator: () => ({ translate: vi.fn() }) }));
vi.mock('@/context/EnvContext', () => {
  const env = { envConfig: {}, appService: { ask: h.ask } };
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
vi.mock('@/services/margins/sync', () => ({ cachedLink: () => ({ textId: 'txt1' }) }));
vi.mock('@/services/margins/public/badges', () => ({ openPassage: h.openPassage }));
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
  getMarginsPainter: () => ({ placements: () => h.placements, postClusters: () => h.clusters }),
  MARGINS_PLACED_EVENT: 'margins-placed',
}));

vi.mock('@/services/margins/public/flag', () => ({ useMarginsPublic: () => h.flag }));
vi.mock('@/services/margins/public/api', async (orig) => ({
  ...(await orig<typeof import('@/services/margins/public/api')>()),
  publicApi: {
    myPosts: async () => h.myPosts,
    appeal: h.appeal,
    unpublish: h.unpublish,
    counterNotice: vi.fn(),
  },
}));

import { MARGINS_PUBLISH_EVENT } from '@/app/reader/components/margins/PublishSheet';
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
  h.flag = false;
  h.myPosts = [];
  h.clusters = new Map();
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

describe('MarginsPopover public state', () => {
  const later = new Date(Date.now() + 86_400_000).toISOString();
  const earlier = new Date(Date.now() - 86_400_000).toISOString();
  const mine = (o: Record<string, unknown> = {}) => ({
    id: 'pst1',
    layerId: 'early',
    version: 1,
    layerRev: 1,
    status: 'live',
    reason: null,
    statusChangedAt: earlier,
    appealUntil: null,
    counterNoticeUntil: null,
    cardUrl: null,
    appealState: 'none',
    noticeWork: null,
    ...o,
  });
  const card = () => screen.getAllByRole('listitem')[0]!;

  beforeEach(() => {
    h.flag = true;
    h.rows = [row('early', 'early passage')];
    h.placements = new Map([['early', { kind: 'placed', section: 1, start: 0, end: 5, step: 1 }]]);
  });

  it('offers Publish on a private Margin and dispatches the publish event', async () => {
    const spy = vi.spyOn(eventDispatcher, 'dispatch');
    await open();
    fireEvent.click(within(card()).getByRole('button', { name: 'Publish' }));
    expect(spy).toHaveBeenCalledWith(MARGINS_PUBLISH_EVENT, { layerId: 'early', bookKey: 'b1' });
    spy.mockRestore();
  });

  it('shows republish when the layer rev is newer', async () => {
    h.rows = [row('early', 'early passage', { rev: 3 })];
    h.myPosts = [mine({ layerRev: 2 })];
    await open();
    within(card()).getByRole('button', { name: 'Changes not public · Republish' });
  });

  it('shows Public and Unpublish on a live post, and asks before unpublishing', async () => {
    h.myPosts = [mine()];
    await open();
    within(card()).getByText('Public');
    await act(async () =>
      fireEvent.click(within(card()).getByRole('button', { name: 'Unpublish' })),
    );
    expect(h.ask).toHaveBeenCalledWith('Remove this Margin from public view?');
    expect(h.unpublish).toHaveBeenCalledWith('pst1');
  });

  it('shows Under review on a hidden post', async () => {
    h.myPosts = [mine({ status: 'hidden' })];
    await open();
    within(card()).getByText('Under review');
  });

  it('offers a counter-notice after a copyright removal', async () => {
    h.myPosts = [
      mine({
        status: 'removed',
        reason: 'copyright',
        noticeWork: 'Moby-Dick',
        counterNoticeUntil: later,
      }),
    ];
    await open();
    within(card()).getByText('Removed after a copyright notice about Moby-Dick');
    fireEvent.click(within(card()).getByRole('button', { name: 'Counter-notice' }));
    within(card()).getByLabelText('Signature');
  });

  it.each([
    ['spam', 'Removed: spam'],
    ['harassment', 'Removed: harassment'],
    ['sexual', 'Removed: sexual content'],
    ['violence_self_harm', 'Removed: violence or self-harm'],
    ['misinformation', 'Removed: misinformation'],
    ['impersonation', 'Removed: impersonation'],
    ['off topic', 'Removed by a moderator'],
  ])('explains a %s removal in plain words', async (reason, copy) => {
    h.myPosts = [mine({ status: 'removed', reason, appealUntil: later })];
    await open();
    within(card()).getByText(copy);
    within(card()).getByRole('button', { name: 'Appeal' });
  });

  it('sends an appeal and reports a second one', async () => {
    h.myPosts = [mine({ status: 'removed', reason: 'spam', appealUntil: later })];
    h.appeal.mockRejectedValue(new PublicApiError(409, 'already_appealed', null, null));
    await open();
    fireEvent.click(within(card()).getByRole('button', { name: 'Appeal' }));
    fireEvent.change(within(card()).getByLabelText('Why should this Margin come back?'), {
      target: { value: 'It is my own words.' },
    });
    await act(async () =>
      fireEvent.click(within(card()).getByRole('button', { name: 'Send appeal' })),
    );
    expect(h.appeal).toHaveBeenCalledWith('pst1', 'It is my own words.');
    within(card()).getByText("You've already appealed this removal.");
  });

  it.each([
    ['pending', 'Appeal sent'],
    ['denied', 'Appeal declined'],
  ])('shows the %s appeal state', async (appealState, copy) => {
    h.myPosts = [mine({ status: 'removed', reason: 'spam', appealUntil: later, appealState })];
    await open();
    within(card()).getByText(copy);
    expect(within(card()).queryByRole('button', { name: 'Appeal' })).toBeNull();
  });

  it('never shows the csam code or a way to contest it', async () => {
    h.myPosts = [
      mine({ status: 'removed', reason: 'csam', appealUntil: later, counterNoticeUntil: later }),
    ];
    await open();
    within(card()).getByText('Removed for violating our rules');
    expect(card().textContent).not.toContain('csam');
    expect(within(card()).queryByRole('button', { name: 'Appeal' })).toBeNull();
    expect(within(card()).queryByRole('button', { name: 'Counter-notice' })).toBeNull();
  });

  it('shows nothing public while the flag is off', async () => {
    h.flag = false;
    h.myPosts = [mine()];
    await open();
    expect(within(card()).queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(within(card()).queryByText('Public')).toBeNull();
  });

  it('lists the post badges of the open sections as buttons', async () => {
    h.clusters = new Map([
      [1, [{ start: 0, end: 4, count: 3, key: 'margins-posts:1:0:4' }]],
      [7, [{ start: 0, end: 4, count: 9, key: 'margins-posts:7:0:4' }]],
    ]);
    await open();
    const list = screen.getByRole('region', { name: 'Public Margins' });
    const buttons = within(list).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['3 takes']);
    expect(buttons[0]!.getAttribute('tabindex')).toBeNull();
    fireEvent.click(buttons[0]!);
    expect(h.openPassage).toHaveBeenCalledWith(
      { bookKey: 'b1', fileHash: 'h1', textId: 'txt1' },
      'margins-posts:1:0:4',
    );
  });
});
