import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LibraryEmptyState from '@/app/library/components/LibraryEmptyState';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, options?: Record<string, string | number>) => {
    if (!options) return key;
    return key.replace(/{{(\w+)}}/g, (_match, name) => String(options[name] ?? ''));
  },
}));

const useAuthMock = vi.fn();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

const navigateToLoginMock = vi.fn();
const routerStub = { push: vi.fn(), replace: vi.fn(), back: vi.fn() };
vi.mock('@/hooks/useAppRouter', () => ({
  useAppRouter: () => routerStub,
}));
vi.mock('@/utils/nav', () => ({
  navigateToLogin: (...args: unknown[]) => navigateToLoginMock(...args),
}));

afterEach(() => {
  cleanup();
  useAuthMock.mockReset();
  navigateToLoginMock.mockReset();
});

describe('LibraryEmptyState', () => {
  it('renders the illustration, title, description, and both CTAs when logged out', () => {
    useAuthMock.mockReturnValue({ user: null });
    render(<LibraryEmptyState onImport={vi.fn()} />);

    expect(
      document.querySelector('img[src="/images/homepage/import-library-placeholder.svg"]'),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: "Let's Fill These Shelves" })).toBeTruthy();
    expect(
      screen.getByText("Import your books and keep everything you're reading in one place"),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import to Library' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in to sync your library' })).toBeTruthy();
  });

  it('hides the sync button when the user is logged in', () => {
    useAuthMock.mockReturnValue({ user: { id: 'stub-user' } });
    render(<LibraryEmptyState onImport={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Import to Library' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sign in to sync your library' })).toBeNull();
  });

  it('calls onImport when the Import to Library button is clicked', () => {
    useAuthMock.mockReturnValue({ user: null });
    const handleImport = vi.fn();
    render(<LibraryEmptyState onImport={handleImport} />);

    fireEvent.click(screen.getByRole('button', { name: 'Import to Library' }));

    expect(handleImport).toHaveBeenCalledTimes(1);
  });
});
