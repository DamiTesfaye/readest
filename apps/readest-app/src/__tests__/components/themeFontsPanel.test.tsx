import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ThemeFontsPanel from '@/components/themefonts/ThemeFontsPanel';
import ThemeCardGrid from '@/components/themefonts/ThemeCardGrid';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ themeColor: 'paper', setThemeColor: vi.fn() }),
}));

vi.mock('@/components/themefonts/ControlRow', () => ({
  default: () => null,
}));

vi.mock('@/components/themefonts/CustomizeSection', () => ({
  default: () => null,
}));

vi.mock('@/components/PopoverTitleBar', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@/components/themescene/ThemeSceneArt', () => ({
  default: () => null,
}));

vi.mock('@/components/themescene/useSceneMotion', () => ({
  useSceneMotion: () => ({ active: false, handlers: {}, onSelect: vi.fn() }),
}));

afterEach(() => cleanup());

describe('ThemeFontsPanel Customize button', () => {
  it('renders the label without the brush icon', () => {
    render(<ThemeFontsPanel bookKey='book-1' />);
    const button = screen.getByRole('button', { name: 'Customize' });
    expect(button.querySelector('img')).toBeNull();
    expect(button.textContent).toBe('Customize');
  });
});

describe('ThemeCardGrid card titles', () => {
  it('wraps long titles at word boundaries instead of truncating', () => {
    render(<ThemeCardGrid />);
    const title = screen.getByText('Cherry Blossom');
    expect(title.className).not.toMatch(/\btruncate\b/);
    expect(title.className).toMatch(/\bwhitespace-normal\b/);
    expect(title.className).toMatch(/\bbreak-words\b/);
    expect(title.className).toMatch(/\btext-center\b/);
  });
});
