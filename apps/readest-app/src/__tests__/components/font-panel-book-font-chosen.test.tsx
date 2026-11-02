import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import FontPanel from '@/components/settings/FontPanel';
import { saveViewSettings } from '@/helpers/settings';
import { DEFAULT_BOOK_FONT } from '@/services/constants';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: {},
    appService: { isAndroidApp: false, getDefaultViewSettings: () => ({ ...DEFAULT_BOOK_FONT }) },
  }),
}));

vi.mock('@/helpers/settings', () => ({ saveViewSettings: vi.fn() }));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: () => null,
    getViewSettings: () => ({ ...DEFAULT_BOOK_FONT, overrideFont: false }),
  }),
}));

vi.mock('@/components/settings/FontDropDown', () => ({
  default: ({ family, onSelect }: { family?: string; onSelect: (f: string) => void }) => (
    <button type='button' onClick={() => onSelect('Literata')}>
      pick-{family ?? 'default'}
    </button>
  ),
}));

const flagWrites = () =>
  vi.mocked(saveViewSettings).mock.calls.filter(([, , key]) => key === 'bookFontChosen');

afterEach(() => {
  cleanup();
  vi.mocked(saveViewSettings).mockClear();
});

describe('FontPanel bookFontChosen', () => {
  const renderPanel = () => {
    let reset = () => {};
    render(<FontPanel bookKey='book-1' onRegisterReset={(fn) => (reset = fn)} />);
    return () => reset();
  };

  it('leaves the flag alone on mount', () => {
    renderPanel();
    expect(flagWrites()).toEqual([]);
  });

  it('sets the flag when the user picks a serif or sans-serif font', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'pick-serif' }));
    expect(flagWrites().at(-1)?.[3]).toBe(true);
    vi.mocked(saveViewSettings).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'pick-sans-serif' }));
    expect(flagWrites().at(-1)?.[3]).toBe(true);
  });

  it('does not set the flag for the monospace picker', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'pick-monospace' }));
    expect(flagWrites()).toEqual([]);
  });

  it('clears the flag on reset', () => {
    const reset = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'pick-serif' }));
    reset();
    expect(flagWrites().at(-1)?.[3]).toBe(false);
  });
});
