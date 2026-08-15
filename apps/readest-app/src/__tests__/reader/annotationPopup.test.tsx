import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let themeColor = 'default';
let isDarkMode = false;

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, opts?: Record<string, string | number>) =>
    opts ? s.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(opts[key] ?? '')) : s,
}));
vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ themeColor, isDarkMode }),
}));
vi.mock('@/components/Popup', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/app/reader/components/annotator/AnnotationNotes', () => ({
  default: () => <div data-testid='annotation-notes' />,
}));

import AnnotationPopup from '@/app/reader/components/annotator/AnnotationPopup';
import type { Position } from '@/utils/sel';

const position: Position = { point: { x: 0, y: 0 }, dir: 'down' };

const renderPopup = (overrides: Partial<React.ComponentProps<typeof AnnotationPopup>> = {}) => {
  const props: React.ComponentProps<typeof AnnotationPopup> = {
    bookKey: 'book-1',
    dir: 'ltr',
    isVertical: false,
    selectedText: 'astonished',
    notes: [],
    position,
    trianglePosition: position,
    selectedStyle: 'highlight',
    selectedColor: 'violet',
    annotatedStyle: null,
    popupWidth: 280,
    popupHeight: 460,
    canShare: true,
    onSelectStyle: vi.fn(),
    onSelectColor: vi.fn(),
    onBookmark: vi.fn(),
    onAddNote: vi.fn(),
    onLookup: vi.fn(),
    onTranslate: vi.fn(),
    onSearch: vi.fn(),
    onCopy: vi.fn(),
    onShare: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
  render(<AnnotationPopup {...props} />);
  return props;
};

beforeEach(() => {
  themeColor = 'default';
  isDarkMode = false;
});

afterEach(cleanup);

describe('AnnotationPopup', () => {
  it('renders the four styles in underline, highlight, squiggly, strikethrough order', () => {
    renderPopup();
    const styleButtons = screen.getAllByRole('button', { name: /style$/ });
    expect(styleButtons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'underline style',
      'highlight style',
      'squiggly style',
      'strikethrough style',
    ]);
  });

  it('stacks all five color variants per style and shows only the selected color', () => {
    renderPopup({ selectedColor: 'violet' });
    const underline = screen.getByRole('button', { name: 'underline style' });
    const imgs = Array.from(underline.querySelectorAll('img'));
    expect(imgs).toHaveLength(5);
    const visible = imgs.filter((img) => img.className.includes('opacity-100'));
    expect(visible).toHaveLength(1);
    expect(visible[0]?.getAttribute('src')).toBe('/images/selection/underline-purple.svg');
    const hidden = imgs.filter((img) => img.className.includes('opacity-0'));
    expect(hidden).toHaveLength(4);
  });

  it('maps the red key to the pink asset', () => {
    renderPopup({ selectedColor: 'red' });
    const highlight = screen.getByRole('button', { name: 'highlight style' });
    const visible = Array.from(highlight.querySelectorAll('img')).find((img) =>
      img.className.includes('opacity-100'),
    );
    expect(visible?.getAttribute('src')).toBe('/images/selection/highlight-pink.svg');
  });

  it('uses muted icon variants in dark mode only', () => {
    isDarkMode = true;
    renderPopup({ selectedColor: 'yellow' });
    const squiggly = screen.getByRole('button', { name: 'squiggly style' });
    const visible = Array.from(squiggly.querySelectorAll('img')).find((img) =>
      img.className.includes('opacity-100'),
    );
    expect(visible?.getAttribute('src')).toBe('/images/selection/underline-wavy-yellow-muted.svg');
    const lookup = screen.getByRole('button', { name: 'Look up "astonished"' });
    expect(lookup.querySelector('img')?.getAttribute('src')).toBe(
      '/images/selection/lookup-muted.svg',
    );
  });

  it('uses normal icon variants on light themes outside the colored icon allowlist', () => {
    themeColor = 'cherry-bloom';
    isDarkMode = false;
    renderPopup();
    const lookup = screen.getByRole('button', { name: 'Look up "astonished"' });
    expect(lookup.querySelector('img')?.getAttribute('src')).toBe('/images/selection/lookup.svg');
  });

  it('animates color switches with an opacity crossfade on every variant', () => {
    renderPopup();
    const underline = screen.getByRole('button', { name: 'underline style' });
    for (const img of Array.from(underline.querySelectorAll('img'))) {
      expect(img.className).toContain('transition-opacity');
    }
  });

  it('scales each style icon to visually match despite differing SVG canvases', () => {
    renderPopup();
    const expectHeights: Array<[string, string]> = [
      ['underline style', 'h-5'],
      ['highlight style', 'h-5'],
      ['squiggly style', 'h-[21px]'],
      ['strikethrough style', 'h-[31px]'],
    ];
    for (const [name, heightClass] of expectHeights) {
      const button = screen.getByRole('button', { name });
      for (const img of Array.from(button.querySelectorAll('img'))) {
        expect(img.className).toMatch(
          new RegExp(`(^| )${heightClass.replace(/[[\]]/g, '\\$&')}( |$)`),
        );
      }
    }
  });

  it('renders action labels in Avenir Next medium', () => {
    renderPopup();
    const label = screen.getByText('Search');
    expect(label.className).toContain('[font-family:"Avenir_Next_LT_Pro"]');
    expect(label.className).toMatch(/\bfont-medium\b/);
    expect(label.className).not.toContain('popover-action-label');
  });

  it('selects a style and a color', () => {
    const props = renderPopup();
    fireEvent.click(screen.getByRole('button', { name: 'strikethrough style' }));
    expect(props.onSelectStyle).toHaveBeenCalledWith('strikethrough');
    fireEvent.click(screen.getByRole('button', { name: 'green color' }));
    expect(props.onSelectColor).toHaveBeenCalledWith('green');
  });

  it('renders the five color dots in yellow, green, violet, blue, red order', () => {
    renderPopup();
    const dots = screen.getAllByRole('button', { name: /color$/ });
    expect(dots.map((d) => d.getAttribute('aria-label'))).toEqual([
      'yellow color',
      'green color',
      'violet color',
      'blue color',
      'red color',
    ]);
  });

  it('marks the annotated style as pressed', () => {
    renderPopup({ annotatedStyle: 'underline' });
    expect(
      screen.getByRole('button', { name: 'underline style' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: 'highlight style' }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('renders action rows with their selection icons and fires their handlers', () => {
    const props = renderPopup();
    const rows: Array<[string, string, keyof typeof props]> = [
      ['Bookmark page', 'bookmark-outline', 'onBookmark'],
      ['Add note', 'add-note-outline', 'onAddNote'],
      ['Look up "astonished"', 'lookup', 'onLookup'],
      ['Translate "astonished"', 'translate', 'onTranslate'],
      ['Search', 'search', 'onSearch'],
      ['Copy', 'copy', 'onCopy'],
      ['Share', 'share', 'onShare'],
    ];
    for (const [label, icon, handler] of rows) {
      const row = screen.getByRole('button', { name: label });
      expect(row.querySelector('img')?.getAttribute('src')).toBe(`/images/selection/${icon}.svg`);
      fireEvent.click(row);
      expect(props[handler]).toHaveBeenCalledTimes(1);
    }
  });

  it('hides the share row when sharing is unavailable', () => {
    renderPopup({ canShare: false });
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
  });

  it('truncates a long selection in the lookup and translate labels', () => {
    renderPopup({ selectedText: 'an exceedingly long selection of words' });
    expect(screen.getByRole('button', { name: 'Look up "an exceedingly l…"' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Translate "an exceedingly l…"' })).toBeTruthy();
  });

  it('shows notes instead of the action sections when notes exist', () => {
    renderPopup({
      notes: [
        {
          id: 'n1',
          type: 'annotation',
          cfi: 'epubcfi(/6/4!/4/2/1:0)',
          note: 'a note',
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });
    expect(screen.getByTestId('annotation-notes')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bookmark page' })).toBeNull();
  });
});
