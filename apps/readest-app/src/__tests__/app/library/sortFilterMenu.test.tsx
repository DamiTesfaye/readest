import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { navigateToLibrary, saveSysSettings } = vi.hoisted(() => ({
  navigateToLibrary: vi.fn(),
  saveSysSettings: vi.fn(),
}));

let settings: Record<string, unknown>;

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ envConfig: { env: 'test' } }) }));
vi.mock('@/store/settingsStore', () => ({ useSettingsStore: () => ({ settings }) }));
vi.mock('@/helpers/settings', () => ({ saveSysSettings }));
vi.mock('@/utils/nav', () => ({ navigateToLibrary }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

import SortFilterMenu from '@/app/library/components/SortFilterMenu';

const section = (name: string) => within(screen.getByRole('group', { name }));

beforeEach(() => {
  settings = {
    libraryGroupBy: 'group',
    librarySortBy: 'updated',
    librarySortAscending: false,
    librarySortByAuto: true,
    librarySortBy2: 'none',
  };
  navigateToLibrary.mockReset();
  saveSysSettings.mockReset();
});

afterEach(cleanup);

describe('SortFilterMenu', () => {
  it('renders the three pill sections from the mockup', () => {
    render(<SortFilterMenu />);
    for (const name of ['Group by', 'Sort by', 'Then arrange by']) {
      expect(screen.getByRole('group', { name })).toBeTruthy();
    }
    for (const label of ['Authors', 'Books', 'Groups', 'Series']) {
      expect(section('Group by').getByRole('button', { name: label })).toBeTruthy();
    }
    for (const label of [
      'Title',
      'Author',
      'Format',
      'Series',
      'Date Read',
      'Date Added',
      'Date Published',
      'Reading Progress',
      'Ascending',
      'Descending',
    ]) {
      expect(section('Sort by').getByRole('button', { name: label })).toBeTruthy();
    }
    expect(section('Then arrange by').getByRole('button', { name: 'Title' })).toBeTruthy();
  });

  it('marks the active pills with aria-pressed', () => {
    render(<SortFilterMenu />);
    expect(
      section('Group by').getByRole('button', { name: 'Groups' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      section('Sort by').getByRole('button', { name: 'Date Read' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      section('Sort by').getByRole('button', { name: 'Descending' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('persists a group-by pick and navigates with the groupBy param', async () => {
    render(<SortFilterMenu />);
    fireEvent.click(section('Group by').getByRole('button', { name: 'Authors' }));
    expect(saveSysSettings).toHaveBeenCalledWith(expect.anything(), 'libraryGroupBy', 'author');
    await waitFor(() => expect(navigateToLibrary.mock.calls[0]?.[1]).toContain('groupBy=author'));
  });

  it('persists a primary sort pick, disables auto and navigates with the sort param', async () => {
    render(<SortFilterMenu />);
    fireEvent.click(section('Sort by').getByRole('button', { name: 'Title' }));
    expect(saveSysSettings).toHaveBeenCalledWith(expect.anything(), 'librarySortBy', 'title');
    await waitFor(() =>
      expect(saveSysSettings).toHaveBeenCalledWith(expect.anything(), 'librarySortByAuto', false),
    );
    await waitFor(() => expect(navigateToLibrary.mock.calls[0]?.[1]).toContain('sort=title'));
  });

  it('persists the sort order', async () => {
    render(<SortFilterMenu />);
    fireEvent.click(section('Sort by').getByRole('button', { name: 'Ascending' }));
    expect(saveSysSettings).toHaveBeenCalledWith(expect.anything(), 'librarySortAscending', true);
    await waitFor(() => expect(navigateToLibrary.mock.calls[0]?.[1]).toContain('order=asc'));
  });

  it('sets a secondary sort and clears it when the active pill is clicked again', async () => {
    render(<SortFilterMenu />);
    fireEvent.click(section('Then arrange by').getByRole('button', { name: 'Author' }));
    expect(saveSysSettings).toHaveBeenCalledWith(expect.anything(), 'librarySortBy2', 'author');
    await waitFor(() => expect(navigateToLibrary.mock.calls[0]?.[1]).toContain('sort2=author'));

    cleanup();
    settings = { ...settings, librarySortBy2: 'author' };
    navigateToLibrary.mockReset();
    saveSysSettings.mockReset();
    render(<SortFilterMenu />);
    const pill = section('Then arrange by').getByRole('button', { name: 'Author' });
    expect(pill.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pill);
    expect(saveSysSettings).toHaveBeenCalledWith(expect.anything(), 'librarySortBy2', 'none');
    await waitFor(() => expect(navigateToLibrary).toHaveBeenCalled());
    expect(navigateToLibrary.mock.calls[0]?.[1] ?? '').not.toContain('sort2=');
  });

  it('highlights the implicit secondary sort when grouping by author', () => {
    settings = { ...settings, libraryGroupBy: 'author' };
    render(<SortFilterMenu />);
    expect(
      section('Then arrange by')
        .getByRole('button', { name: 'Series (Auto)' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
  });
});
