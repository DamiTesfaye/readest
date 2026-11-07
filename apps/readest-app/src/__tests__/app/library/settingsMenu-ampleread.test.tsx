import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { openAmpleReadAccount, navigateToLogin, navigateToProfile } = vi.hoisted(() => ({
  openAmpleReadAccount: vi.fn(),
  navigateToLogin: vi.fn(),
  navigateToProfile: vi.fn(),
}));

let amplereadSession: { me: { displayName: string | null; email: string | null } } | null = null;

vi.mock('@/hooks/useAmpleReadSession', () => ({ useAmpleReadSession: () => amplereadSession }));
vi.mock('@/services/ampleread/auth/openAccount', () => ({ openAmpleReadAccount }));
vi.mock('@/utils/nav', () => ({ navigateToLogin, navigateToProfile }));
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, o?: Record<string, string>) =>
    o ? s.replace(/\{\{(\w+)\}\}/g, (_m, k) => o[k] ?? '') : s,
}));
vi.mock('@/hooks/useAppRouter', () => ({ useAppRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService: { isMobileApp: false } }),
}));
vi.mock('@/hooks/useQuotaStats', () => ({
  useQuotaStats: () => ({ userProfilePlan: 'free', quotas: [] }),
}));
vi.mock('@/hooks/useCloudSyncStatus', () => ({
  useCloudSyncStatus: () => ({ label: 'Never synced', providers: [], syncing: false }),
}));
vi.mock('@/hooks/useTransferQueue', () => ({
  useTransferQueue: () => ({
    stats: { active: 0, pending: 0, failed: 0 },
    hasActiveTransfers: false,
    setIsTransferQueueOpen: vi.fn(),
  }),
}));
vi.mock('@/hooks/useResponsiveSize', () => ({ useResponsiveSize: (n: number) => n }));
vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ themeMode: 'light', setThemeMode: vi.fn() }),
}));
vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: () => ({ isSyncing: false, setLibrary: vi.fn() }),
}));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: {}, setSettingsDialogOpen: vi.fn() }),
}));
vi.mock('@/store/appLockStore', () => ({ useAppLockStore: () => ({ openDialog: vi.fn() }) }));
vi.mock('@/services/environment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/environment')>()),
  isTauriAppPlatform: () => false,
  isWebAppPlatform: () => true,
}));
vi.mock('@/services/biometric', () => ({
  getBiometricStatus: vi.fn(),
  getBiometryLabelKey: vi.fn(),
  isBiometricSupported: () => false,
}));
vi.mock('@/components/Menu', () => ({
  default: ({ children }: { children: React.ReactNode }) => <ul>{children}</ul>,
}));
vi.mock('@/components/MenuItem', () => ({
  default: ({
    label,
    onClick,
    children,
  }: {
    label: string;
    onClick?: () => void;
    children?: React.ReactNode;
  }) => (
    <li>
      <button onClick={onClick}>{label}</button>
      {children}
    </li>
  ),
}));
vi.mock('@/components/Quota', () => ({ default: () => <div data-testid='quota' /> }));
vi.mock('@/components/UserAvatar', () => ({ default: () => null }));

import SettingsMenu from '@/app/library/components/SettingsMenu';

beforeEach(() => {
  amplereadSession = null;
  openAmpleReadAccount.mockReset();
  navigateToLogin.mockReset();
  navigateToProfile.mockReset();
});

afterEach(cleanup);

describe('SettingsMenu account entry', () => {
  it('signs in through the AmpleRead account page, not the Readest login', () => {
    render(<SettingsMenu onPullLibrary={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
    expect(openAmpleReadAccount).toHaveBeenCalledTimes(1);
    expect(navigateToLogin).not.toHaveBeenCalled();
  });

  it('shows the AmpleRead account when signed in and opens it from Account', () => {
    amplereadSession = { me: { displayName: 'Dami', email: 'dami@example.com' } };
    render(<SettingsMenu onPullLibrary={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Logged in as Dami' })).toBeTruthy();
    expect(screen.queryByTestId('quota')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Account' }));
    expect(openAmpleReadAccount).toHaveBeenCalledTimes(1);
    expect(navigateToProfile).not.toHaveBeenCalled();
  });
});
