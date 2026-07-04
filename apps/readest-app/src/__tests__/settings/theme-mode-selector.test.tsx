import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ThemeModeSelector from '@/components/settings/color/ThemeModeSelector';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

describe('ThemeModeSelector sky toggle', () => {
  const renderSelector = (overrides = {}) => {
    const onThemeModeChange = vi.fn();
    const props = {
      themeMode: 'light' as const,
      isDarkMode: false,
      systemIsDarkMode: false,
      onThemeModeChange,
      ...overrides,
    };
    render(<ThemeModeSelector {...props} />);
    return { onThemeModeChange };
  };

  it('tapping the pill in light mode requests dark', () => {
    const { onThemeModeChange } = renderSelector({ isDarkMode: false });
    fireEvent.click(screen.getByRole('switch'));
    expect(onThemeModeChange).toHaveBeenCalledWith('dark');
    cleanup();
  });

  it('tapping the pill in dark mode requests light', () => {
    const { onThemeModeChange } = renderSelector({ themeMode: 'dark', isDarkMode: true });
    fireEvent.click(screen.getByRole('switch'));
    expect(onThemeModeChange).toHaveBeenCalledWith('light');
    cleanup();
  });

  it('the pill reflects the effective mode via aria-checked', () => {
    renderSelector({ themeMode: 'auto', isDarkMode: true });
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('true');
    cleanup();
  });

  it('tapping the A button requests auto', () => {
    const { onThemeModeChange } = renderSelector();
    fireEvent.click(screen.getByTitle('Auto Mode'));
    expect(onThemeModeChange).toHaveBeenCalledWith('auto');
    cleanup();
  });

  it('the A button artwork indicates the current system state', () => {
    renderSelector({ systemIsDarkMode: true });
    const img = screen.getByTitle('Auto Mode').querySelector('img');
    expect(img?.getAttribute('src')).toContain('auto_dark');
    cleanup();

    renderSelector({ systemIsDarkMode: false });
    const img2 = screen.getByTitle('Auto Mode').querySelector('img');
    expect(img2?.getAttribute('src')).toContain('auto_light');
    cleanup();
  });
});
