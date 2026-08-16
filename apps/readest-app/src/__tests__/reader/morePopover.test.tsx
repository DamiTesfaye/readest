import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { saveViewSettings } = vi.hoisted(() => ({ saveViewSettings: vi.fn() }));
let readingRulerEnabled = false;

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ envConfig: { env: 'test' } }) }));
vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ themeColor: 'default', isDarkMode: false }),
}));
vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({ getViewSettings: () => ({ readingRulerEnabled }) }),
}));
vi.mock('@/helpers/settings', () => ({ saveViewSettings }));
vi.mock('@/components/ToolbarPopover', () => ({
  default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));

import MorePopover from '@/app/reader/components/MorePopover';

const renderPopover = (overrides: Partial<React.ComponentProps<typeof MorePopover>> = {}) => {
  const props = {
    bookKey: 'book-1',
    isOpen: true,
    anchorEl: document.body,
    onClose: vi.fn(),
    onGoHome: vi.fn(),
    onOpenThemeFonts: vi.fn(),
    onOpenBooknotes: vi.fn(),
    onOpenAnnotations: vi.fn(),
    ...overrides,
  };
  render(<MorePopover {...props} />);
  return props;
};

beforeEach(() => {
  saveViewSettings.mockReset();
  readingRulerEnabled = false;
});

afterEach(cleanup);

describe('MorePopover', () => {
  it('renders the title, section labels and all rows', () => {
    renderPopover();
    expect(screen.getByText('More')).toBeTruthy();
    expect(screen.getByText('Appearance')).toBeTruthy();
    expect(screen.getByText('Notes & Highlights')).toBeTruthy();
    expect(screen.getByText('Reading Tools')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Theme & Fonts' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Annotations' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bookmarks & Notes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reading Ruler' })).toBeTruthy();
  });

  it('separates the title from the sections with a divider', () => {
    renderPopover();
    expect(document.querySelector('.h-px')).toBeTruthy();
  });

  it('renders section labels in the popover label tier and captions in the action tier', () => {
    renderPopover();
    expect(screen.getByText('Appearance').className).toContain('popover-label');
    expect(screen.getByText('Reading Tools').className).toContain('popover-label');
    expect(screen.getByText('Theme & Fonts').className).toContain('popover-action-label');
    expect(screen.getByText('Annotations').className).toContain('popover-action-label');
  });

  it('keeps a tightened 4px gap between section labels and their rows', () => {
    renderPopover();
    for (const label of ['Appearance', 'Notes & Highlights', 'Reading Tools']) {
      const section = screen.getByText(label).parentElement as HTMLElement;
      expect(section.className).toMatch(/\bgap-1\b/);
    }
    const item = screen.getByRole('button', { name: 'Annotations' });
    expect(item.className).not.toMatch(/\bpy-2\b/);
    expect(item.className).not.toMatch(/\bpt-\d/);
  });

  it('loosens the spacing between sections', () => {
    renderPopover();
    const outer = screen.getByText('Appearance').parentElement?.parentElement as HTMLElement;
    expect(outer.className).toMatch(/\bgap-4\b/);
  });

  it('sizes row icons to match the toolbar icons', () => {
    renderPopover();
    const annotationsIcon = screen
      .getByRole('button', { name: 'Annotations' })
      .querySelector('img');
    expect(annotationsIcon?.className).toMatch(/\bh-8\b/);
    const booknotesIcon = screen
      .getByRole('button', { name: 'Bookmarks & Notes' })
      .querySelector('img');
    expect(booknotesIcon?.className).toMatch(/\bh-7\b/);
    const rulerIcon = screen.getByRole('button', { name: 'Reading Ruler' }).querySelector('img');
    expect(rulerIcon?.className).toMatch(/\bh-8\b/);
    const [small, large] = Array.from(
      screen.getByRole('button', { name: 'Theme & Fonts' }).querySelectorAll('img'),
    );
    expect(small?.className).toMatch(/\bh-3\.5\b/);
    expect(large?.className).toMatch(/\bh-5\b/);
  });

  it('resolves row icons through the themed toolbar icon sources', () => {
    renderPopover();
    const annotations = screen.getByRole('button', { name: 'Annotations' });
    expect(annotations.querySelector('img')?.getAttribute('src')).toBe(
      '/images/toolbar/annotations-cup.svg',
    );
    const booknotes = screen.getByRole('button', { name: 'Bookmarks & Notes' });
    expect(booknotes.querySelector('img')?.getAttribute('src')).toBe(
      '/images/toolbar/bookmarks-notes.svg',
    );
    const ruler = screen.getByRole('button', { name: 'Reading Ruler' });
    expect(ruler.querySelector('img')?.getAttribute('src')).toBe(
      '/images/toolbar/reading-ruler.svg',
    );
  });

  it('opens the Theme & Fonts popover while staying open itself', () => {
    const props = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Theme & Fonts' }));
    expect(props.onOpenThemeFonts).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('opens the Bookmarks & Notes popover while staying open itself', () => {
    const props = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Bookmarks & Notes' }));
    expect(props.onOpenBooknotes).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('opens the Annotations popover while staying open itself', () => {
    const props = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Annotations' }));
    expect(props.onOpenAnnotations).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('reports the clicked row center so the side panel can point at it', () => {
    const props = renderPopover();
    const row = screen.getByRole('button', { name: 'Annotations' });
    row.getBoundingClientRect = () =>
      ({ top: 300, height: 60, bottom: 360, left: 0, right: 0, width: 0 }) as DOMRect;
    fireEvent.click(row);
    expect(props.onOpenAnnotations).toHaveBeenCalledWith(330);

    const booknotes = screen.getByRole('button', { name: 'Bookmarks & Notes' });
    booknotes.getBoundingClientRect = () =>
      ({ top: 300, height: 80, bottom: 380, left: 0, right: 0, width: 0 }) as DOMRect;
    fireEvent.click(booknotes);
    expect(props.onOpenBooknotes).toHaveBeenCalledWith(340);

    const themeFonts = screen.getByRole('button', { name: 'Theme & Fonts' });
    themeFonts.getBoundingClientRect = () =>
      ({ top: 100, height: 60, bottom: 160, left: 0, right: 0, width: 0 }) as DOMRect;
    fireEvent.click(themeFonts);
    expect(props.onOpenThemeFonts).toHaveBeenCalledWith(130);
  });

  it('enables the reading ruler and closes when it is off', () => {
    const props = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Reading Ruler' }));
    expect(saveViewSettings).toHaveBeenCalledWith(
      { env: 'test' },
      'book-1',
      'readingRulerEnabled',
      true,
      false,
      false,
    );
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a green status dot on the Reading Ruler row only while the ruler is on', () => {
    readingRulerEnabled = true;
    const { unmount } = render(
      <MorePopover
        bookKey='book-1'
        isOpen
        anchorEl={document.body}
        onClose={vi.fn()}
        onGoHome={vi.fn()}
        onOpenThemeFonts={vi.fn()}
        onOpenBooknotes={vi.fn()}
        onOpenAnnotations={vi.fn()}
      />,
    );
    const rulerOn = screen.getByRole('button', { name: 'Reading Ruler' });
    expect(rulerOn.getAttribute('aria-pressed')).toBe('true');
    expect(rulerOn.querySelector('.bg-success')).toBeTruthy();
    unmount();

    readingRulerEnabled = false;
    renderPopover();
    const rulerOff = screen.getByRole('button', { name: 'Reading Ruler' });
    expect(rulerOff.getAttribute('aria-pressed')).toBe('false');
    expect(rulerOff.querySelector('.bg-success')).toBeNull();
  });

  it('disables the reading ruler when it is already on', () => {
    readingRulerEnabled = true;
    renderPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Reading Ruler' }));
    expect(saveViewSettings).toHaveBeenCalledWith(
      { env: 'test' },
      'book-1',
      'readingRulerEnabled',
      false,
      false,
      false,
    );
  });

  it('renders the home card with prompt, hint and house icon', () => {
    renderPopover();
    const card = screen.getByRole('button', { name: /Done reading for now\?/ });
    expect(screen.getByText('Done reading for now?').className).toContain('popover-action-label');
    expect(screen.getByText('Head back to your homepage').className).toContain('popover-label');
    expect(card.querySelector('img')?.getAttribute('src')).toBe('/images/toolbar/go-home.svg');
  });

  it('goes home and closes from the home card', () => {
    const props = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: /Done reading for now\?/ }));
    expect(props.onGoHome).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
