import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerRow } from '@/services/margins/store';
import { eventDispatcher } from '@/utils/event';

const h = vi.hoisted(() => ({
  layers: [] as unknown[],
  myPosts: vi.fn(async () => [] as unknown[]),
  requestMarginOpen: vi.fn(),
  navigateToReader: vi.fn(),
  router: {},
  viewPostInPlace: vi.fn(async () => 'placed'),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string) => s,
}));
vi.mock('@/context/EnvContext', () => {
  const env = { envConfig: {}, appService: {} };
  return { useEnv: () => env };
});
vi.mock('next/navigation', () => ({ useRouter: () => h.router }));
vi.mock('@/utils/nav', () => ({ navigateToReader: h.navigateToReader }));
vi.mock('@/services/ampleread/auth/session', () => ({
  getSession: async () => ({ me: { id: 'u1' } }),
}));
vi.mock('@/services/margins/store', () => ({
  openMarginsStore: async () => ({ allLayers: async () => h.layers }),
}));
vi.mock('@/services/margins/public/flag', () => ({
  useMarginsPublic: () => true,
  marginsPublicEnabled: async () => true,
}));
vi.mock('@/services/margins/public/api', () => ({ publicApi: { myPosts: h.myPosts } }));
vi.mock('@/app/reader/hooks/useMarginsPainter', () => ({
  requestMarginOpen: h.requestMarginOpen,
  viewPostInPlace: h.viewPostInPlace,
  MARGINS_OPEN_CARD_EVENT: 'margins-open-card',
}));
vi.mock('@/app/reader/components/margins/PostCard', () => ({
  PostSheet: ({ postId }: { postId: string }) => <div role='dialog'>{`post ${postId}`}</div>,
}));
vi.mock('@/app/reader/components/margins/PassageSheet', () => ({
  default: ({
    sectionLen,
    onViewInPlace,
  }: {
    sectionLen: number;
    onViewInPlace(p: unknown): void;
  }) => (
    <div role='dialog' aria-label='passage'>
      {`len ${sectionLen}`}
      <button type='button' onClick={() => onViewInPlace({ id: 'pst1' })}>
        View in place
      </button>
    </div>
  ),
}));
vi.mock('@/app/reader/components/margins/PublishSheet', async (orig) => ({
  ...(await orig<typeof import('@/app/reader/components/margins/PublishSheet')>()),
  default: ({ row, existing }: { row: LayerRow; existing: { id: string } | null }) => (
    <div role='dialog'>{`publish ${row.id} ${existing?.id ?? 'new'}`}</div>
  ),
}));

import { Toast } from '@/components/Toast';
import PublicMarginsHost, { offerPublish } from '@/app/reader/components/margins/PublicMarginsHost';
import {
  MARGINS_PUBLISH_EVENT,
  MARGINS_SHORTEN_EVENT,
} from '@/app/reader/components/margins/PublishSheet';

const row = { id: 'lay1', fileHash: 'h9', rev: 2 } as LayerRow;

const mount = async (bookKey: string | null) => {
  render(<PublicMarginsHost bookKey={bookKey} />);
  await act(async () => {});
};

beforeEach(() => {
  vi.clearAllMocks();
  h.layers = [row];
});

afterEach(cleanup);

describe('PublicMarginsHost', () => {
  it('opens the publish sheet on the publish event, with the existing post', async () => {
    h.myPosts.mockResolvedValue([{ id: 'pst1', layerId: 'lay1', status: 'live' }]);
    await mount('b1');
    await act(() => eventDispatcher.dispatch(MARGINS_PUBLISH_EVENT, { layerId: 'lay1' }));
    screen.getByText('publish lay1 pst1');
  });

  it('ignores a publish event for another book', async () => {
    await mount('b1');
    await act(() =>
      eventDispatcher.dispatch(MARGINS_PUBLISH_EVENT, { layerId: 'lay1', bookKey: 'b2' }),
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('publishes an unpublished Margin as new', async () => {
    h.myPosts.mockResolvedValue([{ id: 'pst1', layerId: 'lay1', status: 'unpublished' }]);
    await mount('b1');
    await act(() => eventDispatcher.dispatch(MARGINS_PUBLISH_EVENT, { layerId: 'lay1' }));
    screen.getByText('publish lay1 new');
  });

  it('opens the card in the reader to shorten the Clip', async () => {
    const opened = vi.fn();
    eventDispatcher.on('margins-open-card', opened);
    await mount('b1');
    await act(() => eventDispatcher.dispatch(MARGINS_SHORTEN_EVENT, { layerId: 'lay1' }));
    expect(opened).not.toHaveBeenCalled();
    await act(() => eventDispatcher.dispatch(MARGINS_PUBLISH_EVENT, { layerId: 'lay1' }));
    await act(() => eventDispatcher.dispatch(MARGINS_SHORTEN_EVENT, { layerId: 'lay1' }));
    expect(opened.mock.calls[0]![0].detail).toEqual({ bookKey: 'b1', ids: ['lay1'] });
    eventDispatcher.off('margins-open-card', opened);
  });

  it('opens the book from the Library to shorten the Clip', async () => {
    await mount(null);
    await act(() => eventDispatcher.dispatch(MARGINS_SHORTEN_EVENT, { layerId: 'lay1' }));
    expect(h.requestMarginOpen).toHaveBeenCalledWith('h9', 'lay1');
    expect(h.navigateToReader).toHaveBeenCalledWith(h.router, ['h9']);
  });

  it('offers Publish in a toast after Compose, and only its action opens the sheet', async () => {
    const toast = vi.fn();
    const publish = vi.fn();
    eventDispatcher.on('toast', toast);
    eventDispatcher.on(MARGINS_PUBLISH_EVENT, publish);
    await offerPublish('lay1', 'Kept', 'Publish');
    const detail = toast.mock.calls[0]![0].detail;
    expect(detail).toMatchObject({ message: 'Kept', action: { label: 'Publish' } });
    expect(publish).not.toHaveBeenCalled();
    await detail.action.onClick();
    expect(publish.mock.calls[0]![0].detail).toEqual({ layerId: 'lay1' });
    eventDispatcher.off('toast', toast);
    eventDispatcher.off(MARGINS_PUBLISH_EVENT, publish);
  });

  it('shows the Publish action in the Toast', async () => {
    const publish = vi.fn();
    eventDispatcher.on(MARGINS_PUBLISH_EVENT, publish);
    render(<Toast />);
    await act(() => offerPublish('lay1', 'Kept', 'Publish', 'b1'));
    screen.getByText('Kept');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Publish' })));
    expect(publish.mock.calls[0]![0].detail).toEqual({ layerId: 'lay1', bookKey: 'b1' });
    eventDispatcher.off(MARGINS_PUBLISH_EVENT, publish);
  });

  it('opens the passage sheet for its own book and views a post in place', async () => {
    const toast = vi.fn();
    eventDispatcher.on('toast', toast);
    await mount('b1');
    const passage = { textId: 'txt1', section: 3, sectionLen: 900, start: 1, end: 9 };
    await act(() =>
      eventDispatcher.dispatch('margins-open-passage', { ...passage, bookKey: 'b2' }),
    );
    expect(screen.queryByRole('dialog', { name: 'passage' })).toBeNull();
    await act(() =>
      eventDispatcher.dispatch('margins-open-passage', { ...passage, bookKey: 'b1' }),
    );
    screen.getByText('len 900');
    h.viewPostInPlace.mockResolvedValueOnce('missing');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'View in place' })));
    expect(h.viewPostInPlace).toHaveBeenCalledWith('b1', { id: 'pst1' });
    expect(toast.mock.calls[0]![0].detail).toMatchObject({
      message: "This passage isn't in your copy.",
    });
    eventDispatcher.off('toast', toast);
  });

  it('opens the single-post sheet from ?post= and from the open-post event', async () => {
    render(<PublicMarginsHost bookKey={null} postId='pst_a' />);
    await act(async () => {});
    screen.getByText('post pst_a');
    await act(() => eventDispatcher.dispatch('margins-open-post', { postId: 'pst_b' }));
    screen.getByText('post pst_b');
  });
});
