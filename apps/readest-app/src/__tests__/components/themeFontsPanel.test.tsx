import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ThemeFontsPanel from '@/components/themefonts/ThemeFontsPanel';
import ThemeCardGrid from '@/components/themefonts/ThemeCardGrid';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

const themeState = vi.hoisted(() => ({ themeColor: 'paper' }));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ themeColor: themeState.themeColor, setThemeColor: vi.fn() }),
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
  default: ({ themeName }: { themeName: string }) => <i data-testid={`scene-${themeName}`} />,
}));

vi.mock('@/components/themescene/useSceneMotion', () => ({
  useSceneMotion: () => ({ active: false, handlers: {}, onSelect: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  themeState.themeColor = 'paper';
});

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

describe('ThemeCardGrid Neue Paper card', () => {
  it('draws the hand-drawn card while Neue Paper is active', () => {
    render(<ThemeCardGrid />);
    expect(screen.getByTestId('paper-card-art')).toBeTruthy();
    expect(screen.queryByTestId('scene-paper')).toBeNull();
  });

  it('keeps the scene art under any other theme', () => {
    themeState.themeColor = 'desert-sunset';
    render(<ThemeCardGrid />);
    expect(screen.queryByTestId('paper-card-art')).toBeNull();
    expect(screen.getByTestId('scene-paper')).toBeTruthy();
  });
});
