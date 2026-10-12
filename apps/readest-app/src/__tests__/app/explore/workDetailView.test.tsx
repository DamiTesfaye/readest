import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WorkDetailView from '@/app/explore/components/WorkDetailView';
import type { WorkDetail } from '@/services/ampleread';

const mockRefresh = vi.fn();
const mockGetWorkDetail = vi.fn();
const mockTrackEvent = vi.fn();
const mockGetDownloadUrl = vi.fn();
const mockIsTauriAppPlatform = vi.fn(() => true);
const mockDownloadFile = vi.fn();
const mockProbeFilename = vi.fn();
const mockImportBook = vi.fn();
const mockSaveLibraryBooks = vi.fn();
const mockSetLibrary = vi.fn();

vi.mock('@/services/ampleread', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/ampleread')>();
  return {
    ...actual,
    refresh: (...args: unknown[]) => mockRefresh(...args),
    getWorkDetail: (...args: unknown[]) => mockGetWorkDetail(...args),
    trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
    getDownloadUrl: (...args: unknown[]) => mockGetDownloadUrl(...args),
  };
});

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: () => mockIsTauriAppPlatform(),
}));

vi.mock('@/libs/storage', () => ({
  downloadFile: (...args: unknown[]) => mockDownloadFile(...args),
}));

vi.mock('@/app/opds/utils/opdsReq', () => ({
  probeFilename: (...args: unknown[]) => mockProbeFilename(...args),
}));

vi.mock('@/store/libraryStore', () => {
  const { create } = require('zustand');
  return {
    useLibraryStore: create(() => ({
      library: [] as unknown[],
      setLibrary: (...args: unknown[]) => mockSetLibrary(...args),
    })),
  };
});

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: {
      resolveFilePath: async (name: string) => `/cache/${name}`,
      copyFile: async () => undefined,
      deleteFile: async () => undefined,
      importBook: (...args: unknown[]) => mockImportBook(...args),
      saveLibraryBooks: (...args: unknown[]) => mockSaveLibraryBooks(...args),
    },
  }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

const importedBook = {
  hash: 'abc123',
  title: 'The Great Book',
  author: 'Jane Doe',
  format: 'EPUB',
  createdAt: 1,
  updatedAt: 1,
};

const detail: WorkDetail = {
  id: 'work-1',
  title: 'The Great Book',
  description: 'A sweeping tale.',
  subjects: ['Fiction', 'Adventure'],
  preferredEditionId: 'ed-1',
  editions: [
    {
      id: 'ed-1',
      sourceName: 'gutenberg',
      language: 'en',
      mediaType: 'text',
      assets: [
        { id: 'as-pdf', kind: 'pdf', bytes: 2000 },
        { id: 'as-1', kind: 'epub', bytes: 1000 },
      ],
      capabilities: { canRead: true, canDownload: true, canTransform: false },
      attribution: 'Project Gutenberg',
    },
    {
      id: 'ed-2',
      sourceName: 'librivox',
      language: 'fr',
      mediaType: 'audio',
      assets: [],
      capabilities: { canRead: false, canDownload: true, canTransform: false },
      attribution: null,
    },
  ],
};

describe('WorkDetailView', () => {
  beforeEach(() => {
    mockRefresh.mockResolvedValue(undefined);
    mockGetWorkDetail.mockResolvedValue(detail);
    mockTrackEvent.mockResolvedValue(undefined);
    mockIsTauriAppPlatform.mockReturnValue(true);
    mockGetDownloadUrl.mockResolvedValue('https://www.gutenberg.org/ebooks/9.epub3.images');
    mockDownloadFile.mockResolvedValue({});
    mockProbeFilename.mockResolvedValue('');
    mockImportBook.mockImplementation(async (_path: string, books: unknown[]) => {
      books.push(importedBook);
      return importedBook;
    });
    mockSaveLibraryBooks.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('refreshes the work scope before reading the detail, then records an open event', async () => {
    const calls: string[] = [];
    mockRefresh.mockImplementation(async (scope: string) => {
      calls.push(`refresh:${scope}`);
    });
    mockGetWorkDetail.mockImplementation(async (id: string) => {
      calls.push(`detail:${id}`);
      return detail;
    });

    render(<WorkDetailView workId='work-1' onBack={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'The Great Book' })).toBeTruthy();
    expect(calls).toEqual(['refresh:work:work-1', 'detail:work-1']);
    await waitFor(() => expect(mockTrackEvent).toHaveBeenCalledTimes(1));
    expect(mockTrackEvent).toHaveBeenCalledWith({ kind: 'open', workId: 'work-1' });
  });

  it('renders description, subjects and one row per edition', async () => {
    render(<WorkDetailView workId='work-1' onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'The Great Book' });

    expect(screen.getByText('A sweeping tale.')).toBeTruthy();
    expect(screen.getByText('Fiction')).toBeTruthy();
    expect(screen.getByText('Adventure')).toBeTruthy();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('gutenberg');
    expect(rows[0]?.textContent).toContain('en');
    expect(rows[0]?.textContent).toContain('text');
    expect(rows[0]?.textContent).toContain('Project Gutenberg');
    expect(rows[1]?.textContent).toContain('librivox');
    expect(rows[1]?.textContent).toContain('audio');
  });

  it('shows the not-found state with a back action when refresh reports the work is gone', async () => {
    mockRefresh.mockRejectedValue(new Error('not found: work work-1'));
    const onBack = vi.fn();

    render(<WorkDetailView workId='work-1' onBack={onBack} />);

    expect(await screen.findByText(/no longer available/i)).toBeTruthy();
    expect(mockGetWorkDetail).not.toHaveBeenCalled();
    expect(mockTrackEvent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows a generic error, not the not-found copy, for other failures', async () => {
    mockRefresh.mockRejectedValue(new Error('http error: 500'));

    render(<WorkDetailView workId='work-1' onBack={vi.fn()} />);

    expect(await screen.findByText('http error: 500')).toBeTruthy();
    expect(screen.queryByText(/no longer available/i)).toBeNull();
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it('shows Download only for editions that have assets', async () => {
    render(<WorkDetailView workId='work-1' onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'The Great Book' });

    const buttons = screen.getAllByRole('button', { name: 'Download' });
    expect(buttons).toHaveLength(1);
    expect(screen.getAllByRole('listitem')[0]?.contains(buttons[0]!)).toBe(true);
  });

  it('downloads the epub asset, imports it with provenance and records download and save', async () => {
    render(<WorkDetailView workId='work-1' onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'The Great Book' });

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => expect(mockImportBook).toHaveBeenCalledTimes(1));
    expect(mockGetDownloadUrl).toHaveBeenCalledWith('work-1', 'as-1');
    expect(mockDownloadFile).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://www.gutenberg.org/ebooks/9.epub3.images' }),
    );
    expect(mockSetLibrary).toHaveBeenCalledWith([
      expect.objectContaining({
        hash: 'abc123',
        ampleread: { workId: 'work-1', editionId: 'ed-1' },
      }),
    ]);
    await waitFor(() =>
      expect(mockTrackEvent).toHaveBeenCalledWith({
        kind: 'download',
        workId: 'work-1',
        editionId: 'ed-1',
      }),
    );
    expect(mockTrackEvent).toHaveBeenCalledWith({
      kind: 'save',
      workId: 'work-1',
      editionId: 'ed-1',
    });
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/added/i);
  });

  it('re-reads the detail and asks to try again when the download URL is gone, without retrying', async () => {
    mockGetDownloadUrl.mockRejectedValue(new Error('not found: asset as-1'));
    const refreshedDetail: WorkDetail = {
      ...detail,
      editions: [
        {
          ...detail.editions[0]!,
          assets: [{ id: 'as-2', kind: 'epub', bytes: 1000 }],
        },
      ],
    };
    mockGetWorkDetail.mockResolvedValueOnce(detail).mockResolvedValueOnce(refreshedDetail);

    render(<WorkDetailView workId='work-1' onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'The Great Book' });

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(await screen.findByText(/try again/i)).toBeTruthy();
    expect(mockGetWorkDetail).toHaveBeenCalledTimes(2);
    expect(mockGetDownloadUrl).toHaveBeenCalledTimes(1);
    expect(mockImportBook).not.toHaveBeenCalled();
    expect(mockTrackEvent).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'download' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
  });

  it('surfaces other download failures without re-reading the detail', async () => {
    mockGetDownloadUrl.mockRejectedValue(new Error('http error: 503'));

    render(<WorkDetailView workId='work-1' onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'The Great Book' });

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    expect(await screen.findByText(/http error: 503/)).toBeTruthy();
    expect(mockGetWorkDetail).toHaveBeenCalledTimes(1);
    expect(mockImportBook).not.toHaveBeenCalled();
  });

  it('opens the download route in the browser on the web passthrough and records nothing', async () => {
    mockIsTauriAppPlatform.mockReturnValue(false);
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<WorkDetailView workId='work-1' onBack={vi.fn()} />);
    await screen.findByRole('heading', { name: 'The Great Book' });

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        'https://www.gutenberg.org/ebooks/9.epub3.images',
        '_blank',
      ),
    );
    expect(mockDownloadFile).not.toHaveBeenCalled();
    expect(mockImportBook).not.toHaveBeenCalled();
    expect(mockTrackEvent).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'download' }));
    expect(mockTrackEvent).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'save' }));
    open.mockRestore();
  });
});
