import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostView } from '@/services/margins/public/api';

const h = vi.hoisted(() => ({
  target: { kind: 'library', bookHash: 'h1' } as unknown,
  requestPostOpen: vi.fn(),
  rememberPendingOpen: vi.fn(),
  navigateToReader: vi.fn(),
  openExternalUrl: vi.fn(),
  getWorkDetail: vi.fn(async () => ({ editions: [{ id: 'ed1' }] })),
  downloadEdition: vi.fn(async () => ({ hash: 'h9' })),
  router: {},
}));

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/context/EnvContext', () => {
  const env = { envConfig: {}, appService: {} };
  return { useEnv: () => env };
});
vi.mock('next/navigation', () => ({ useRouter: () => h.router }));
vi.mock('@/utils/nav', () => ({ navigateToReader: h.navigateToReader }));
vi.mock('@/utils/open', () => ({ openExternalUrl: h.openExternalUrl }));
vi.mock('@/store/libraryStore', () => {
  const state = { library: [{ hash: 'h1' }] };
  const useLibraryStore = (sel: (s: typeof state) => unknown) => sel(state);
  return { useLibraryStore };
});
vi.mock('@/services/margins/store', () => ({ openMarginsStore: async () => ({}) }));
vi.mock('@/services/margins/public/openPost', async (orig) => ({
  ...(await orig<typeof import('@/services/margins/public/openPost')>()),
  openTargetFor: async () => h.target,
  requestPostOpen: h.requestPostOpen,
  rememberPendingOpen: h.rememberPendingOpen,
}));
vi.mock('@/services/ampleread', () => ({
  getWorkDetail: h.getWorkDetail,
  canDownloadEdition: () => true,
}));
vi.mock('@/services/ampleread/download', () => ({ downloadEdition: h.downloadEdition }));
vi.mock('@/app/explore/components/WorkDetailView', () => ({
  default: ({ workId }: { workId: string }) => <div>{`listing ${workId}`}</div>,
}));

import GetBookSheet from '@/components/margins/feed/GetBookSheet';

const post = (book: Partial<PostView['book']> = {}) =>
  ({
    id: 'pst1',
    textId: 'txt1',
    book: {
      title: 'Meditations',
      author: null,
      workId: null,
      capped: true,
      findUrl: null,
      ...book,
    },
  }) as PostView;

const show = async (p = post()) => {
  const onTap = vi.fn();
  render(<GetBookSheet post={p} onClose={vi.fn()} onTap={onTap} />);
  await act(async () => {});
  return onTap;
};

const tap = async (name: string) => {
  await act(async () => fireEvent.click(screen.getByRole('button', { name })));
};

beforeEach(() => {
  vi.clearAllMocks();
  h.target = { kind: 'library', bookHash: 'h1' };
});
afterEach(cleanup);

describe('GetBookSheet', () => {
  it('opens a library book at the page', async () => {
    const p = post();
    const onTap = await show(p);
    await tap('Open at this page');
    expect(h.requestPostOpen).toHaveBeenCalledWith('h1', p);
    expect(h.navigateToReader).toHaveBeenCalledWith(h.router, ['h1']);
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('gets a free catalogue book, then opens it at the page', async () => {
    h.target = { kind: 'download', workId: 'wrk1' };
    const onTap = await show(post({ workId: 'wrk1', capped: false }));
    await tap('Get this book (free)');
    expect(h.downloadEdition).toHaveBeenCalledWith(
      expect.objectContaining({ workId: 'wrk1', edition: { id: 'ed1' } }),
    );
    expect(h.requestPostOpen).toHaveBeenCalledWith('h9', expect.objectContaining({ id: 'pst1' }));
    expect(h.navigateToReader).toHaveBeenCalledWith(h.router, ['h9']);
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('shows the catalogue listing for a capped book in the catalogue', async () => {
    h.target = { kind: 'yourCopy' };
    await show(post({ workId: 'wrk2' }));
    screen.getByText('listing wrk2');
    expect(screen.queryByRole('button', { name: 'Find this book' })).toBeNull();
    expect(h.rememberPendingOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'pst1' }));
  });

  it('finds a book outside the catalogue through the store link', async () => {
    h.target = { kind: 'yourCopy' };
    const onTap = await show(post({ findUrl: 'https://books.example/search?q=Meditations' }));
    await tap('Find this book');
    expect(h.openExternalUrl).toHaveBeenCalledWith('https://books.example/search?q=Meditations');
    expect(onTap).toHaveBeenCalledTimes(1);
  });
});
