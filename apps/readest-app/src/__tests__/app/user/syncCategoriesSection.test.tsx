import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { EnvConfigType } from '@/services/environment';

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {} as EnvConfigType, appService: null }),
}));

import { SyncCategoriesSection } from '@/app/user/components/SyncCategoriesSection';
import { isSyncCategoryEnabled } from '@/services/sync/syncCategories';
import { useSettingsStore } from '@/store/settingsStore';
import type { SystemSettings } from '@/types/settings';

const saveSettings = vi.fn(async () => {});

beforeEach(() => {
  useSettingsStore.setState({ settings: { syncCategories: {} } as SystemSettings, saveSettings });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SyncCategoriesSection mind maps toggle', () => {
  test('is on by default and turning it off stops mind map sync', () => {
    render(<SyncCategoriesSection />);
    const toggle = screen.getByRole<HTMLInputElement>('switch', { name: 'Mind maps' });
    expect(toggle.checked).toBe(true);
    expect(isSyncCategoryEnabled('mindmap')).toBe(true);
    fireEvent.click(toggle);
    expect(isSyncCategoryEnabled('mindmap')).toBe(false);
    expect(saveSettings).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ syncCategories: { mindmap: false } }),
    );
  });
});
