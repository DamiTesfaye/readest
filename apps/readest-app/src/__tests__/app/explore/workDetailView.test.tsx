import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WorkDetailView from '@/app/explore/components/WorkDetailView';
import type { WorkDetail } from '@/services/ampleread';

const mockRefresh = vi.fn();
const mockGetWorkDetail = vi.fn();
const mockTrackEvent = vi.fn();

vi.mock('@/services/ampleread', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/ampleread')>();
  return {
    ...actual,
    refresh: (...args: unknown[]) => mockRefresh(...args),
    getWorkDetail: (...args: unknown[]) => mockGetWorkDetail(...args),
    trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
  };
});

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

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
      assets: [{ id: 'as-1', kind: 'epub', bytes: 1000 }],
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
});
