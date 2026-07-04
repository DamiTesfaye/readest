import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ThemeColorSelector from '@/components/settings/color/ThemeColorSelector';
import { themes } from '@/styles/themes';

afterEach(cleanup);

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: (n: number) => n,
}));

describe('ThemeColorSelector masonry cards', () => {
  const renderSelector = (overrides = {}) => {
    const onThemeColorChange = vi.fn();
    const onEditTheme = vi.fn();
    const onCreateTheme = vi.fn();
    const props = {
      themes,
      themeColor: 'default',
      isDarkMode: false,
      onThemeColorChange,
      onEditTheme,
      onCreateTheme,
      ...overrides,
    };
    render(<ThemeColorSelector {...props} />);
    return { onThemeColorChange, onEditTheme, onCreateTheme };
  };

  it('renders the four scene cards but not the hidden default', () => {
    renderSelector();
    for (const name of [/Paper/, /Desert Sunset/, /Starry Night/, /Night Pond/]) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: /^Default/ })).toBeNull();
  });

  it('renders the create-your-own heading and the Custom tile', () => {
    renderSelector();
    expect(screen.getByText('Prefer something different? Create your own theme')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Custom/ })).toBeTruthy();
  });

  it('clicking a card fires onThemeColorChange with its name', () => {
    const { onThemeColorChange } = renderSelector();
    fireEvent.click(screen.getByRole('button', { name: /Starry Night/ }));
    expect(onThemeColorChange).toHaveBeenCalledWith('starry-night');
    cleanup();
  });

  it('clicking the selected card still fires the handler (deselect is caller-owned)', () => {
    const { onThemeColorChange } = renderSelector({ themeColor: 'night-pond' });
    fireEvent.click(screen.getByRole('button', { name: /Night Pond/ }));
    expect(onThemeColorChange).toHaveBeenCalledWith('night-pond');
    cleanup();
  });

  it('renders custom themes as cards alongside the scenes', () => {
    const customThemes: typeof themes = [
      {
        name: 'my-custom',
        label: 'My Custom',
        colors: {
          light: themes[1]!.colors.light,
          dark: themes[1]!.colors.dark,
        },
        isCustomizale: true,
      },
    ];
    renderSelector({ themes: themes.concat(customThemes), themeColor: 'my-custom' });
    expect(screen.getByRole('button', { name: /My Custom/ })).toBeTruthy();
    cleanup();
  });

  it('marks the active card via aria-pressed', () => {
    renderSelector({ themeColor: 'paper' });
    const paperButton = screen.getByRole('button', { name: /Paper/ });
    expect(paperButton.getAttribute('aria-pressed')).toBe('true');
    cleanup();
  });
});
