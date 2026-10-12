import React from 'react';
import { act, render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { saveViewSettings, getHomeRowVariant, dispatch, openEntry } = vi.hoisted(() => ({
  saveViewSettings: vi.fn(),
  getHomeRowVariant: vi.fn(),
  dispatch: vi.fn(),
  openEntry: vi.fn(),
}));
let readingRulerEnabled = false;
let movingPicturesEnabled = false;
let readerQuickPicks: Array<string | null> = [null, null, null, null];
let isDarkMode = false;

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ envConfig: { env: 'test' } }) }));
vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ themeColor: 'default', isDarkMode }),
}));
vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getViewSettings: () => ({ readingRulerEnabled, movingPicturesEnabled }),
  }),
}));
vi.mock('@/helpers/settings', () => ({ saveViewSettings }));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: Object.assign(() => ({ settings: { readerQuickPicks } }), {
    getState: () => ({ settings: { readerQuickPicks } }),
  }),
}));
vi.mock('@/utils/homeRowVariant', () => ({ getHomeRowVariant, getAppSessionSeed: () => 99 }));
vi.mock('@/components/motionrive/TextInMotionArt', () => ({ default: () => <span /> }));
vi.mock('@/components/sparkrive/SparkTileArt', () => ({
  default: ({
    icon,
    imgClassName,
    colored,
    openDelayMs,
  }: {
    icon: string;
    imgClassName: string;
    colored: boolean;
    openDelayMs: number;
  }) => (
    <img
      data-testid={`spark-art-${icon}`}
      data-colored={colored}
      data-delay={openDelayMs}
      className={imgClassName}
      alt=''
    />
  ),
}));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch } }));
vi.mock('@/store/mindmapViewStore', () => ({
  useMindmapViewStore: { getState: () => ({ openEntry }) },
}));
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
    onOpenLibrary: vi.fn(),
    onOpenContents: vi.fn(),
    onToggleTTS: vi.fn(),
    ...overrides,
  };
  render(<MorePopover {...props} />);
  return props;
};

beforeEach(() => {
  saveViewSettings.mockReset();
  getHomeRowVariant.mockReset();
  getHomeRowVariant.mockReturnValue({ subtitle: 'Head back home', icon: 'go-home' });
  readingRulerEnabled = false;
  movingPicturesEnabled = false;
  readerQuickPicks = [null, null, null, null];
  isDarkMode = false;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(hover: hover)',
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  dispatch.mockReset();
  openEntry.mockReset();
  openEntry.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const rowNames = () =>
  Array.from(document.querySelectorAll('button, label')).map(
    (button) => button.querySelector('.popover-action-label')?.textContent,
  );

describe('MorePopover', () => {
  it('renders the title, section labels and all rows', () => {
    renderPopover();
    expect(screen.getByText('More')).toBeTruthy();
    expect(screen.getByText('Appearance')).toBeTruthy();
    expect(screen.getByText('Notes & Highlights')).toBeTruthy();
    expect(screen.getByText('Augment your reading')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Theme & Fonts/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Annotations/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Bookmarks & Notes/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Reading Ruler/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Moving Pictures/ })).toBeTruthy();
  });

  it('separates the title from the sections with a divider', () => {
    renderPopover();
    expect(document.querySelector('.h-px')).toBeTruthy();
  });

  it('renders section labels in the popover label tier and captions in the action tier', () => {
    renderPopover();
    expect(screen.getByText('Appearance').className).toContain('popover-label');
    expect(screen.getByText('Augment your reading').className).toContain('popover-label');
    expect(screen.getByText('Theme & Fonts').className).toContain('popover-action-label');
    expect(screen.getByText('Annotations').className).toContain('popover-action-label');
  });

  it('lists every action in one column, Library first and the home card last', () => {
    renderPopover();
    expect(rowNames()).toEqual([
      'Library',
      'Contents',
      'Theme & Fonts',
      'Annotations',
      'Bookmarks & Notes',
      'Margins',
      'Mindmap',
      'Discuss with Tim & Fini',
      'Summarise',
      'TTS',
      'Mood & Modes',
      'Moving Pictures',
      'Reading Ruler',
      'Done reading for now?',
    ]);
    expect(document.querySelector('.grid')).toBeNull();
    const library = screen.getByRole('button', { name: /^Library/ });
    expect(library.compareDocumentPosition(screen.getByText('Appearance'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('offers Contents beside Library with its scanning art and opens the table of contents', () => {
    const props = renderPopover();
    const contents = screen.getByRole('button', { name: /^Contents/ });
    expect(screen.getByText('Jump between chapters')).toBeTruthy();
    expect(contents.querySelector('[data-testid="more-art-contents"]')).toBeTruthy();
    expect(contents.getAttribute('draggable')).toBe('true');
    fireEvent.click(contents);
    expect(props.onOpenContents).toHaveBeenCalledTimes(1);
  });

  it('hides the quick picks pinned to the header and empties no section', () => {
    readerQuickPicks = ['library', 'margins', null, 'contents'];
    renderPopover();
    expect(screen.queryByRole('button', { name: /^Library/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Margins/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Contents/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Mindmap/ })).toBeTruthy();
    cleanup();
    readerQuickPicks = ['theme-fonts', null, null, null];
    renderPopover();
    expect(screen.queryByText('Appearance')).toBeNull();
    expect(screen.getByText('Notes & Highlights')).toBeTruthy();
  });

  it('makes rows draggable and wobbles their art while arranging', () => {
    const onArrangeChange = vi.fn();
    renderPopover({ isArranging: true, onArrangeChange });
    const mindmap = screen.getByRole('button', { name: /Mindmap/ });
    expect(mindmap.getAttribute('draggable')).toBe('true');
    expect(mindmap.querySelector('.quick-pick-wobble')).toBeTruthy();
    const store = new Map<string, string>();
    fireEvent.dragStart(mindmap, {
      dataTransfer: { setData: (k: string, v: string) => store.set(k, v), effectAllowed: '' },
    });
    expect(store.get('application/x-ample-quick-pick')).toBe('mindmap');
    expect(onArrangeChange).toHaveBeenLastCalledWith(true);
    fireEvent.dragEnd(mindmap);
    expect(onArrangeChange).toHaveBeenLastCalledWith(false);
  });

  it('places the spark actions under Augment your reading', () => {
    renderPopover();
    const section = screen.getByText('Augment your reading').parentElement as HTMLElement;
    for (const name of [/Margins/, /Mindmap/, /Discuss/, /Summarise/, /TTS/, /Mood & Modes/]) {
      expect(section.contains(screen.getByRole('button', { name }))).toBe(true);
    }
    for (const name of [/Moving Pictures/, /Reading Ruler/]) {
      expect(section.contains(screen.getByRole('checkbox', { name }))).toBe(true);
    }
  });

  it('lays each row out as art beside its title and subtitle', () => {
    renderPopover();
    const mindmap = screen.getByRole('button', { name: /Mindmap/ });
    expect(mindmap.className).toMatch(/\bflex-row\b|\bflex\b/);
    expect(mindmap.className).not.toMatch(/\bflex-col\b/);
    expect(mindmap.querySelector('[data-testid="spark-art-mindmap"]')).toBeTruthy();
    expect(screen.getByText('Organise thoughts').className).toContain('popover-label');
    expect(screen.getByText('Mindmap').className).toContain('popover-action-label');
    for (const subtitle of [
      'Shape your reading experience',
      'Shorten your reading',
      'Read texts aloud',
      'Host-led podcast',
      'Readers, notes & finds',
      'Switch to another book',
      'Style the page your way',
      'Review your highlights',
      'Saved spots & thoughts',
      'Watch scenes come alive',
      'Guide your eyes line by line',
    ]) {
      expect(screen.getByText(subtitle)).toBeTruthy();
    }
  });

  it('keeps the Tim & Fini hosts on the discuss row in the serif title face', () => {
    renderPopover();
    const discuss = screen.getByRole('button', { name: /Discuss/ });
    expect(discuss.textContent).toContain('with');
    const hosts = screen.getByText('Tim & Fini');
    expect(discuss.contains(hosts)).toBe(true);
    expect(hosts.className).toContain('popover-title');
  });

  it('opens the library from the Library row', () => {
    const props = renderPopover();
    const library = screen.getByRole('button', { name: /^Library/ });
    expect(library.querySelector('[data-testid="more-art-library"]')).toBeTruthy();
    fireEvent.click(library);
    expect(props.onOpenLibrary).toHaveBeenCalledTimes(1);
  });

  it('toggles TTS and closes from the TTS row', () => {
    const props = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: /TTS/ }));
    expect(props.onToggleTTS).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a coming soon toast and closes for unreleased spark features', () => {
    for (const name of [/Mood & Modes/, /Summarise/, /Discuss/, /Margins/]) {
      dispatch.mockReset();
      const props = renderPopover();
      fireEvent.click(screen.getByRole('button', { name }));
      expect(dispatch).toHaveBeenCalledWith('toast', { type: 'info', message: 'Coming soon' });
      expect(props.onClose).toHaveBeenCalledTimes(1);
      expect(props.onToggleTTS).not.toHaveBeenCalled();
      cleanup();
    }
  });

  it('opens the mind map for the book, refocuses the trigger and closes', async () => {
    const anchorEl = document.createElement('button');
    document.body.appendChild(anchorEl);
    const props = renderPopover({ anchorEl });
    fireEvent.click(screen.getByRole('button', { name: /Mindmap/ }));
    expect(openEntry).toHaveBeenCalledWith('book-1');
    expect(document.activeElement).toBe(anchorEl);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(dispatch).not.toHaveBeenCalled();
    anchorEl.remove();
  });

  it('shows an error toast when the mind map cannot open', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    openEntry.mockRejectedValue(new Error('disk'));
    renderPopover();
    fireEvent.click(screen.getByRole('button', { name: /Mindmap/ }));
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith('toast', {
        type: 'error',
        message: 'Could not open the mind map',
      }),
    );
    error.mockRestore();
  });

  it('sizes row icons to the original popover dimensions', () => {
    renderPopover();
    const libraryIcon = screen.getByTestId('more-art-library');
    expect(libraryIcon.getAttribute('class')).toMatch(/\bh-6\b/);
    const annotationsIcon = screen.getByTestId('more-art-annotations-cup');
    expect(annotationsIcon.getAttribute('class')).toMatch(/\bh-8\b/);
    const booknotesIcon = screen.getByTestId('more-art-bookmarks-notes');
    expect(booknotesIcon.getAttribute('class')).toMatch(/\bh-7\b/);
    const rulerIcon = screen
      .getByRole('checkbox', { name: /Reading Ruler/ })
      .closest('label')
      ?.querySelector('img');
    expect(rulerIcon?.className).toMatch(/\bh-8\b/);
    const [small, large] = Array.from(
      screen.getByRole('button', { name: /Theme & Fonts/ }).querySelectorAll('img'),
    );
    expect(small?.className).toMatch(/\bh-3\.5\b/);
    expect(large?.className).toMatch(/\bh-5\b/);
    for (const icon of ['margins', 'mindmap', 'discuss', 'summarise', 'tts', 'mood-modes']) {
      expect(screen.getByTestId(`spark-art-${icon}`).className).toMatch(/\bh-8\b/);
    }
  });

  it('renders each static row on its animated art inside the row', () => {
    renderPopover();
    const rows: Array<[string, string]> = [
      ['Library', 'library'],
      ['Theme & Fonts', 'theme-fonts'],
      ['Annotations', 'annotations-cup'],
      ['Bookmarks & Notes', 'bookmarks-notes'],
      ['Done reading for now?', 'go-home'],
    ];
    for (const [name, art] of rows) {
      const row = screen.getByRole('button', { name: new RegExp(name.replace('?', '\\?')) });
      expect(row.querySelector(`[data-testid="more-art-${art}"]`)).toBeTruthy();
    }
    const ruler = screen.getByRole('checkbox', { name: /Reading Ruler/ }).closest('label')!;
    expect(ruler.querySelector('[data-testid="more-art-reading-ruler"]')).toBeTruthy();
    expect(ruler.querySelector('img')?.getAttribute('src')).toBe(
      '/images/toolbar/reading-ruler.svg',
    );
  });

  it('uses the colored art in light mode and the muted art in dark mode', () => {
    renderPopover();
    expect(screen.getByTestId('spark-art-mindmap').getAttribute('data-colored')).toBe('true');
    expect(
      screen
        .getByRole('checkbox', { name: /Reading Ruler/ })
        .closest('label')
        ?.querySelector('img')
        ?.getAttribute('src'),
    ).toBe('/images/toolbar/reading-ruler.svg');
    cleanup();
    isDarkMode = true;
    renderPopover();
    expect(screen.getByTestId('spark-art-mindmap').getAttribute('data-colored')).toBe('false');
    expect(
      screen
        .getByRole('checkbox', { name: /Reading Ruler/ })
        .closest('label')
        ?.querySelector('img')
        ?.getAttribute('src'),
    ).toBe('/images/toolbar/reading-ruler-muted.svg');
    const card = screen.getByRole('button', { name: /Done reading for now\?/ });
    expect(card.querySelector('img')?.getAttribute('src')).toBe(
      '/images/toolbar/go-home-muted.svg',
    );
  });

  it('plays a row art while the mouse is over the row and ignores touch', () => {
    renderPopover();
    const row = screen.getByRole('button', { name: /^Annotations/ });
    const art = screen.getByTestId('more-art-annotations-cup');
    fireEvent.pointerEnter(row, { pointerType: 'touch' });
    expect(art.getAttribute('data-animating')).toBe('false');
    fireEvent.pointerEnter(row, { pointerType: 'mouse' });
    expect(art.getAttribute('data-animating')).toBe('true');
    expect(screen.getByTestId('more-art-library').getAttribute('data-animating')).toBe('false');
  });

  it('plays the home card art while the mouse is over the card', () => {
    renderPopover();
    const card = screen.getByRole('button', { name: /Done reading for now\?/ });
    fireEvent.pointerEnter(card, { pointerType: 'mouse' });
    expect(screen.getByTestId('more-art-go-home').getAttribute('data-animating')).toBe('true');
  });

  it('staggers the opening play down the column on touch devices', () => {
    vi.useFakeTimers();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    renderPopover();
    const playing = (art: string) =>
      screen.getByTestId(`more-art-${art}`).getAttribute('data-animating');
    act(() => vi.advanceTimersByTime(0));
    expect(playing('library')).toBe('true');
    expect(playing('contents')).toBe('false');
    act(() => vi.advanceTimersByTime(150));
    expect(playing('contents')).toBe('true');
    expect(playing('theme-fonts')).toBe('false');
    expect(screen.getByTestId('spark-art-mindmap').getAttribute('data-delay')).toBe('900');
  });

  it('opens the Theme & Fonts popover while staying open itself', () => {
    const props = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: /Theme & Fonts/ }));
    expect(props.onOpenThemeFonts).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('opens the Bookmarks & Notes popover while staying open itself', () => {
    const props = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: /Bookmarks & Notes/ }));
    expect(props.onOpenBooknotes).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('opens the Annotations popover while staying open itself', () => {
    const props = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: /^Annotations/ }));
    expect(props.onOpenAnnotations).toHaveBeenCalledTimes(1);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('reports the clicked row rect so the panel can anchor to it', () => {
    const props = renderPopover();
    const row = screen.getByRole('button', { name: /^Annotations/ });
    row.getBoundingClientRect = () =>
      ({ top: 300, bottom: 360, left: 700, right: 900, height: 60, width: 200 }) as DOMRect;
    fireEvent.click(row);
    expect(props.onOpenAnnotations).toHaveBeenCalledWith(
      expect.objectContaining({ top: 300, bottom: 360, left: 700, right: 900 }),
    );

    const booknotes = screen.getByRole('button', { name: /Bookmarks & Notes/ });
    booknotes.getBoundingClientRect = () =>
      ({ top: 300, bottom: 380, left: 950, right: 1150, height: 80, width: 200 }) as DOMRect;
    fireEvent.click(booknotes);
    expect(props.onOpenBooknotes).toHaveBeenCalledWith(
      expect.objectContaining({ top: 300, bottom: 380, left: 950, right: 1150 }),
    );

    const themeFonts = screen.getByRole('button', { name: /Theme & Fonts/ });
    themeFonts.getBoundingClientRect = () =>
      ({ top: 100, bottom: 160, left: 700, right: 900, height: 60, width: 200 }) as DOMRect;
    fireEvent.click(themeFonts);
    expect(props.onOpenThemeFonts).toHaveBeenCalledWith(
      expect.objectContaining({ top: 100, bottom: 160 }),
    );
  });

  it('enables the reading ruler and closes when it is off', () => {
    const props = renderPopover();
    fireEvent.click(screen.getByRole('checkbox', { name: /Reading Ruler/ }));
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

  it('shows the switch artwork on the right of the Reading Ruler and Moving Pictures rows', () => {
    readingRulerEnabled = true;
    renderPopover();
    for (const [name, checked, src] of [
      [/Reading Ruler/, true, '/images/toolbar/switch-on-yellow.svg'],
      [/Moving Pictures/, false, '/images/toolbar/switch-off.svg'],
    ] as const) {
      const toggle = screen.getByRole('checkbox', { name }) as HTMLInputElement;
      expect(toggle.checked).toBe(checked);
      const switchArt = toggle.closest('label')?.lastElementChild as HTMLElement;
      expect(switchArt.contains(toggle)).toBe(true);
      expect(switchArt.querySelector('img')?.getAttribute('src')).toBe(src);
    }
    expect(document.querySelector('.bg-success')).toBeNull();
  });

  it('shows the purple switch while moving pictures is on', () => {
    movingPicturesEnabled = true;
    renderPopover();
    const toggle = screen.getByRole('checkbox', { name: /Moving Pictures/ });
    expect(
      toggle.closest('label')?.lastElementChild?.querySelector('img')?.getAttribute('src'),
    ).toBe('/images/toolbar/switch-on-purple.svg');
  });

  it('keeps the coloured switch for an enabled row in dark mode', () => {
    isDarkMode = true;
    readingRulerEnabled = true;
    movingPicturesEnabled = true;
    renderPopover();
    for (const [name, src] of [
      [/Reading Ruler/, '/images/toolbar/switch-on-yellow.svg'],
      [/Moving Pictures/, '/images/toolbar/switch-on-purple.svg'],
    ] as const) {
      const toggle = screen.getByRole('checkbox', { name });
      expect(
        toggle.closest('label')?.lastElementChild?.querySelector('img')?.getAttribute('src'),
      ).toBe(src);
    }
  });

  it('keeps the art close to the row text', () => {
    renderPopover();
    const row = screen.getByRole('button', { name: /Mindmap/ });
    expect(row.className).toContain('gap-2');
    expect(row.firstElementChild?.className).toContain('w-12');
  });

  it('turns moving pictures on and closes', () => {
    const props = renderPopover();
    fireEvent.click(screen.getByRole('checkbox', { name: /Moving Pictures/ }));
    expect(saveViewSettings).toHaveBeenCalledWith(
      { env: 'test' },
      'book-1',
      'movingPicturesEnabled',
      true,
      false,
      false,
    );
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('disables the reading ruler when it is already on', () => {
    readingRulerEnabled = true;
    renderPopover();
    fireEvent.click(screen.getByRole('checkbox', { name: /Reading Ruler/ }));
    expect(saveViewSettings).toHaveBeenCalledWith(
      { env: 'test' },
      'book-1',
      'readingRulerEnabled',
      false,
      false,
      false,
    );
  });

  it('renders the home card with prompt, derived hint and house icon', () => {
    getHomeRowVariant.mockReturnValue({ subtitle: 'Make tracks for home', icon: 'go-home' });
    renderPopover();
    const card = screen.getByRole('button', { name: /Done reading for now\?/ });
    expect(screen.getByText('Done reading for now?').className).toContain('popover-action-label');
    expect(screen.getByText('Make tracks for home').className).toContain('popover-label');
    expect(card.querySelector('img')?.getAttribute('src')).toBe('/images/toolbar/go-home.svg');
    expect(getHomeRowVariant).toHaveBeenCalledWith(
      expect.objectContaining({ bookKey: 'book-1', sessionSeed: 99, now: expect.any(Date) }),
    );
  });

  it('shows the space base when the home card returns to base', () => {
    getHomeRowVariant.mockReturnValue({ subtitle: 'Return to base', icon: 'space-base' });
    renderPopover();
    const card = screen.getByRole('button', { name: /Done reading for now\?/ });
    expect(screen.getByText('Return to base').className).toContain('popover-label');
    expect(card.querySelector('img')?.getAttribute('src')).toBe('/images/toolbar/space-base.svg');
  });

  it('goes home and closes from the home card', () => {
    const props = renderPopover();
    fireEvent.click(screen.getByRole('button', { name: /Done reading for now\?/ }));
    expect(props.onGoHome).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
