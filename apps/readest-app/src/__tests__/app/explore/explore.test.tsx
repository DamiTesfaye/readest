import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ExplorePage from '@/app/explore/page';
import type { ExploreResponse } from '@/services/ampleread';

const mockGetExplore = vi.fn();
const mockRefresh = vi.fn();
const mockGetWorkDetail = vi.fn();
const mockTrackEvent = vi.fn();

vi.mock('@/services/ampleread', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/ampleread')>();
  return {
    ...actual,
    getExplore: (...args: unknown[]) => mockGetExplore(...args),
    refresh: (...args: unknown[]) => mockRefresh(...args),
    getWorkDetail: (...args: unknown[]) => mockGetWorkDetail(...args),
    trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
  };
});

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ fill: _fill, ...props }: Record<string, unknown>) => {
    // biome-ignore lint/a11y/useAltText: test mock; alt comes from spread props
    return <img {...props} />;
  },
}));

const buildExplore = (overrides?: Partial<ExploreResponse>): ExploreResponse => ({
  shelves: [
    {
      id: 'shelf-1',
      title: 'New Releases',
      layout: 'row',
      more: null,
      items: [
        {
          id: 'work-1',
          title: 'The Great Book',
          authors: [{ id: 'a1', name: 'Jane Doe' }],
          cover: 'https://example.com/cover.jpg',
          language: 'en',
          hasAudio: false,
          formats: ['epub'],
        },
        {
          id: 'work-2',
          title: 'No Cover Book',
          authors: [{ id: 'a2', name: 'John Smith' }],
          cover: null,
          language: 'en',
          hasAudio: true,
          formats: ['epub', 'pdf'],
        },
      ],
    },
  ],
  ...overrides,
});

describe('ExplorePage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders shelves and cards from the mocked ampleread service', async () => {
    mockGetExplore.mockResolvedValue(buildExplore());

    render(<ExplorePage />);

    expect(await screen.findByText('New Releases')).toBeTruthy();
    expect(screen.getByText('The Great Book')).toBeTruthy();
    expect(screen.getByText('Jane Doe')).toBeTruthy();
    expect(screen.getByText('No Cover Book')).toBeTruthy();
    expect(screen.getByText('John Smith')).toBeTruthy();
    expect(mockGetExplore).toHaveBeenCalledTimes(1);
  });

  it('renders a cover placeholder when a card has no cover', async () => {
    mockGetExplore.mockResolvedValue(buildExplore());

    const { container } = render(<ExplorePage />);
    await screen.findByText('No Cover Book');

    expect(container.querySelector('img[alt="No Cover Book"]')).toBeNull();
    expect(container.querySelector('img[alt="The Great Book"]')).not.toBeNull();
  });

  it('renders an unknown shelf layout identically to the "row" layout', async () => {
    const rowExplore = buildExplore();
    const unknownExplore = buildExplore({
      shelves: [{ ...rowExplore.shelves[0]!, id: 'shelf-unknown', layout: 'carousel-3d' }],
    });

    mockGetExplore.mockResolvedValueOnce(rowExplore);
    const { container: rowContainer, unmount: unmountRow } = render(<ExplorePage />);
    await screen.findByText('New Releases');
    const rowRoot = rowContainer.querySelector('[data-shelf-layout]');
    const rowClassName = rowRoot?.className;
    const rowDataLayout = rowRoot?.getAttribute('data-shelf-layout');
    unmountRow();

    mockGetExplore.mockResolvedValueOnce(unknownExplore);
    const { container: unknownContainer } = render(<ExplorePage />);
    await screen.findByText('New Releases');
    const unknownRoot = unknownContainer.querySelector('[data-shelf-layout]');

    expect(rowDataLayout).toBe('row');
    expect(unknownRoot?.getAttribute('data-shelf-layout')).toBe(rowDataLayout);
    expect(unknownRoot?.className).toBe(rowClassName);
  });

  it('calls refresh("explore") then re-fetches Explore when the refresh action is used', async () => {
    mockGetExplore.mockResolvedValue(buildExplore());
    mockRefresh.mockResolvedValue(undefined);

    render(<ExplorePage />);
    await screen.findByText('New Releases');

    const refreshButton = screen.getByRole('button', { name: 'Refresh' });
    fireEvent.click(refreshButton);

    await waitFor(() => expect(mockRefresh).toHaveBeenCalledWith('explore'));
    await waitFor(() => expect(mockGetExplore).toHaveBeenCalledTimes(2));
  });

  it('renders a card whose work has no formats without a formats count or a download control', async () => {
    const explore = buildExplore();
    const shelf = explore.shelves[0]!;
    const zeroFormatCard = {
      ...shelf.items[0]!,
      id: 'work-audio',
      title: 'Silent Audio Book',
      hasAudio: true,
      formats: [],
    };
    mockGetExplore.mockResolvedValue({ shelves: [{ ...shelf, items: [zeroFormatCard] }] });

    render(<ExplorePage />);
    await screen.findByText('Silent Audio Book');

    expect(screen.queryByText(/0 formats/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /download/i })).toBeNull();
  });

  it('renders only the shelves present in the response, with no placeholder for absent shelves', async () => {
    const explore = buildExplore();
    const onlyShelf = { ...explore.shelves[0]!, id: 'fiction-a-z', title: 'Fiction A to Z' };
    mockGetExplore.mockResolvedValue({ shelves: [onlyShelf] });

    const { container } = render(<ExplorePage />);
    await screen.findByText('Fiction A to Z');

    expect(container.querySelectorAll('section.explore-shelf')).toHaveLength(1);
    expect(screen.queryByText(/essential classics/i)).toBeNull();
  });

  it('renders an explore response with no shelves as an empty list rather than an error', async () => {
    mockGetExplore.mockResolvedValue({ shelves: [] });

    const { container } = render(<ExplorePage />);
    await waitFor(() => expect(container.querySelector('.explore-shelves')).not.toBeNull());

    expect(container.querySelectorAll('section.explore-shelf')).toHaveLength(0);
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('opens the work detail from a card tap and returns to the shelves from Back', async () => {
    mockGetExplore.mockResolvedValue(buildExplore());
    mockRefresh.mockResolvedValue(undefined);
    mockTrackEvent.mockResolvedValue(undefined);
    mockGetWorkDetail.mockResolvedValue({
      id: 'work-1',
      title: 'The Great Book',
      description: 'Detail copy',
      subjects: [],
      preferredEditionId: null,
      editions: [],
    });

    render(<ExplorePage />);
    await screen.findByText('New Releases');

    fireEvent.click(screen.getByRole('button', { name: /The Great Book/ }));

    expect(await screen.findByText('Detail copy')).toBeTruthy();
    expect(mockRefresh).toHaveBeenCalledWith('work:work-1');
    expect(mockGetWorkDetail).toHaveBeenCalledWith('work-1');
    expect(screen.queryByText('New Releases')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('New Releases')).toBeTruthy();
    expect(mockGetExplore).toHaveBeenCalledTimes(1);
  });

  it('does not call fetch or invoke directly from the page', async () => {
    mockGetExplore.mockResolvedValue(buildExplore());
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    render(<ExplorePage />);
    await screen.findByText('New Releases');

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
