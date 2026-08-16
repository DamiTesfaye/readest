import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { navigateToLibrary, navigateToLogin, navigateToProfile, dispatch } = vi.hoisted(() => ({
  navigateToLibrary: vi.fn(),
  navigateToLogin: vi.fn(),
  navigateToProfile: vi.fn(),
  dispatch: vi.fn(),
}));

let searchString = '';
let authState: { user: { user_metadata?: Record<string, string> } | null; token: string | null } = {
  user: null,
  token: null,
};

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: { env: 'test' },
    appService: { osPlatform: 'macos', isMobile: false, hasWindowBar: false },
  }),
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => authState }));
vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ isDarkMode: false, safeAreaInsets: { top: 0 } }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(searchString),
}));
vi.mock('@/hooks/useAppRouter', () => ({ useAppRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/utils/nav', () => ({ navigateToLibrary, navigateToLogin, navigateToProfile }));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch } }));
vi.mock('@/utils/debounce', () => ({
  debounce: (fn: (...args: unknown[]) => void) => fn,
}));
vi.mock('@/utils/access', () => ({ getUserProfilePlan: () => 'free' }));
vi.mock('@/hooks/useTrafficLight', () => ({
  useTrafficLight: () => ({ isTrafficLightVisible: false }),
}));
vi.mock('@/components/Dropdown', () => ({
  default: ({
    label,
    toggleButton,
    children,
  }: {
    label?: string;
    toggleButton: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <div>
      <button aria-label={label}>{toggleButton}</button>
      <div>{children}</div>
    </div>
  ),
}));
vi.mock('@/app/library/components/SettingsMenu', () => ({
  default: () => <div data-testid='settings-menu' />,
}));
vi.mock('@/components/UserAvatar', () => ({ default: () => <div data-testid='avatar' /> }));

import LibrarySidebar from '@/app/library/components/LibrarySidebar';

const renderSidebar = (overrides: Partial<React.ComponentProps<typeof LibrarySidebar>> = {}) => {
  const props = {
    onPullLibrary: vi.fn(),
    onOpenCatalogManager: vi.fn(),
    ...overrides,
  };
  render(<LibrarySidebar {...props} />);
  return props;
};

beforeEach(() => {
  searchString = '';
  authState = { user: null, token: null };
  navigateToLibrary.mockReset();
  navigateToLogin.mockReset();
  navigateToProfile.mockReset();
  dispatch.mockReset();
});

afterEach(cleanup);

describe('LibrarySidebar', () => {
  it('renders search, section labels and all nav items', () => {
    renderSidebar();
    expect(screen.getByRole('searchbox')).toBeTruthy();
    expect(screen.getByText('Library')).toBeTruthy();
    expect(screen.getByText('Discover')).toBeTruthy();
    for (const label of [
      'All',
      'Currently Reading',
      'Finished',
      'Collections',
      'Shared',
      'Catalogs',
      'RSS Feeds',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('collapses the Tags section by default and expands it from the header', () => {
    renderSidebar();
    const header = screen.getByRole('button', { name: 'Tags' });
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Red' })).toBeNull();
    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    for (const label of ['Red', 'Orange', 'Green', 'Blue', 'Purple', 'Yellow']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    fireEvent.click(header);
    expect(screen.queryByRole('button', { name: 'Red' })).toBeNull();
  });

  it('toasts Coming soon for Collections and tag items', () => {
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Collections' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tags' }));
    fireEvent.click(screen.getByRole('button', { name: 'Red' }));
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0]?.[0]).toBe('toast');
  });

  it('marks All active by default and the matching status filter when set', () => {
    renderSidebar();
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-current')).toBe('page');
    cleanup();
    searchString = 'status=reading';
    renderSidebar();
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-current')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Currently Reading' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('navigates with the status param for reading/finished and clears it for All', () => {
    searchString = 'status=finished';
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Currently Reading' }));
    expect(navigateToLibrary.mock.calls[0]?.[1]).toContain('status=reading');
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(navigateToLibrary.mock.calls[1]?.[1] ?? '').not.toContain('status=');
  });

  it('toasts Coming soon for Shared and RSS Feeds', () => {
    renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Shared' }));
    fireEvent.click(screen.getByRole('button', { name: 'RSS Feeds' }));
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0]?.[0]).toBe('toast');
    expect(dispatch.mock.calls[0]?.[1]?.message).toBe('Coming soon');
  });

  it('opens the catalog manager from Catalogs', () => {
    const props = renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Catalogs' }));
    expect(props.onOpenCatalogManager).toHaveBeenCalledTimes(1);
  });

  it('updates the q param when typing in search', () => {
    renderSidebar();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'moby' } });
    expect(navigateToLibrary.mock.calls[0]?.[1]).toContain('q=moby');
  });

  it('focuses the search input on cmd+k', () => {
    renderSidebar();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
  });

  it('opens the settings menu from the sign-in card when logged out', () => {
    renderSidebar();
    expect(screen.getByRole('button', { name: 'Sign into your account' })).toBeTruthy();
    expect(screen.getByTestId('settings-menu')).toBeTruthy();
    expect(navigateToLogin).not.toHaveBeenCalled();
  });

  it('shows name, plan and Upgrade when logged in, routing to the profile', () => {
    authState = {
      user: { user_metadata: { full_name: 'Dami Tesfaye' } },
      token: 'jwt',
    };
    renderSidebar();
    expect(screen.getByText('Dami Tesfaye')).toBeTruthy();
    expect(screen.getByText('Free')).toBeTruthy();
    expect(screen.getByTestId('settings-menu')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    expect(navigateToProfile).toHaveBeenCalledTimes(1);
  });

  it('no longer renders the view/select/settings footer strip', () => {
    renderSidebar();
    expect(screen.queryByRole('button', { name: 'View Menu' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Select Books' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Settings Menu' })).toBeNull();
  });

  it('has no collapse control, so the sidebar stays expanded', () => {
    renderSidebar();
    expect(screen.queryByRole('button', { name: 'Collapse Sidebar' })).toBeNull();
  });

  it('renders search, section labels and nav items in Avenir Next', () => {
    renderSidebar();
    const font = '[font-family:"Avenir_Next_LT_Pro"]';
    expect(screen.getByRole('searchbox').className).toContain(font);
    expect(screen.getByText('Library').className).toContain(font);
    expect(screen.getByRole('button', { name: 'Currently Reading' }).className).toContain(font);
    expect(screen.getByRole('button', { name: 'Sign into your account' }).innerHTML).toContain(
      'Avenir_Next_LT_Pro',
    );
  });
});
