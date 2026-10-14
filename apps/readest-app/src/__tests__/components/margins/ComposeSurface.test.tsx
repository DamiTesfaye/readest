import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Element, Envelope } from '@/services/margins/payload';
import { emptyEnvelope } from '@/services/margins/payload';
import type { Anchor } from '@/services/margins/types';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, opts?: Record<string, string | number>) =>
    opts ? s.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(opts[key] ?? '')) : s,
}));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: null }) }));
vi.mock('@/hooks/useTranslator', () => ({
  useTranslator: () => ({ translate: vi.fn(async () => ['bonjour']) }),
}));
vi.mock('@/services/ampleread/auth/session', () => ({ getSession: async () => null }));

import ComposeSurface from '@/app/reader/components/margins/ComposeSurface';

const anchor = { quote: { exact: 'Alice was beginning' } } as unknown as Anchor;
const frame = { x: 0.5, y: 0.5, w: 0.5, r: 0 };
const note = (id: string, text: string): Element => ({ id, kind: 'note', frame, text });
const withElements = (...elements: Element[]): Envelope => ({ ...emptyEnvelope(), elements });

const renderSurface = (o: Partial<React.ComponentProps<typeof ComposeSurface>> = {}) => {
  const onSave = vi.fn(async () => {});
  const onDiscard = vi.fn();
  const utils = render(
    <ComposeSurface
      initial={withElements(note('n1', 'hello'))}
      quote={anchor.quote}
      liveQuoteText='Alice was beginning'
      capped
      quoteCost={19}
      used={0}
      anchor={Promise.resolve(anchor)}
      onSave={onSave}
      onDiscard={onDiscard}
      {...o}
    />,
  );
  return { ...utils, onSave, onDiscard };
};

const elementBox = (container: HTMLElement, id: string) =>
  container.querySelector<HTMLElement>(`[data-element-id="${id}"]`);
const save = () => screen.getByRole<HTMLButtonElement>('button', { name: /^(Save|Preparing…)$/ });
const select = (container: HTMLElement, id: string) => {
  fireEvent.pointerDown(elementBox(container, id)!, { clientX: 0, clientY: 0 });
  fireEvent.pointerUp(elementBox(container, id)!);
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ComposeSurface', () => {
  it('renders one plain toolbar button per tool with its label', () => {
    renderSurface();
    const toolbar = screen.getByRole('toolbar');
    const labels = Array.from(toolbar.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toEqual([
      'Select',
      'Note',
      'Translate',
      'Gloss',
      'Add image',
      'Draw',
      'Sticker',
      'Animate',
      'Background',
      'Bring forward',
      'Send backward',
      'Delete',
      'Undo',
      'Redo',
    ]);
  });

  it('hands an empty card to play mode from the Play tool', () => {
    const onPlay = vi.fn();
    renderSurface({ initial: emptyEnvelope(), onPlay });
    const play = screen.getByRole('button', { name: 'Play' });
    fireEvent.click(play);
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('shows no Play tool when editing an existing Margin', () => {
    renderSurface();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
  });

  it('sizes the translation limit from the stored quote once the anchor resolves', async () => {
    const translation = {
      id: 't1',
      kind: 'translation',
      frame,
      mode: 'translation',
      lang: 'fr',
      text: 'x'.repeat(250),
      source: 'hand',
    } as Element;
    renderSurface({ initial: withElements(translation), quoteCost: 300 });
    await act(async () => {});
    expect(save().disabled).toBe(true);
  });

  it('disables Save above 16 KiB of envelope', async () => {
    const big = 'é'.repeat(2000);
    renderSurface({
      initial: withElements(...['a', 'b', 'c', 'd', 'e'].map((id) => note(id, big))),
    });
    await act(async () => {});
    expect(save().disabled).toBe(true);
    screen.getByText('This Margin is too long to keep. Shorten a note or translation.');
  });

  it('disables Save while an artwork has no alt', async () => {
    const { container } = renderSurface({
      initial: withElements({
        id: 'a1',
        kind: 'artwork',
        frame,
        asset: 'local:7d6c2f3e-8a1b-4c5d-9e0f-1a2b3c4d5e6f',
        alt: '',
        source: 'drawing',
      }),
    });
    await act(async () => {});
    expect(save().disabled).toBe(true);
    select(container, 'a1');
    fireEvent.change(screen.getByLabelText('Describe this image'), {
      target: { value: 'A rabbit' },
    });
    expect(save().disabled).toBe(false);
  });

  it('shows Preparing… while the anchor is pending and the §14 copy after 20 s', async () => {
    vi.useFakeTimers();
    const { container } = renderSurface({ anchor: new Promise<Anchor>(() => {}) });
    expect(save().textContent).toBe('Preparing…');
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    screen.getByText(
      "We're still reading this book. Your Margin is kept here; try Save again in a moment.",
    );
    expect(elementBox(container, 'n1')).not.toBeNull();
  });

  it('saves the envelope with the anchor', async () => {
    const { onSave } = renderSurface();
    await act(async () => {});
    await act(async () => fireEvent.click(save()));
    expect(onSave).toHaveBeenCalledWith(withElements(note('n1', 'hello')), anchor);
  });

  it('removes the selection with Delete, undoes and redoes, and nudges with arrows', () => {
    const { container } = renderSurface({
      initial: withElements(note('n1', 'hello'), note('n2', 'there')),
    });
    const surface = screen.getByRole('application');
    select(container, 'n1');

    fireEvent.keyDown(surface, { key: 'ArrowRight' });
    expect(elementBox(container, 'n1')!.style.left).toBe('51%');
    fireEvent.keyDown(surface, { key: 'ArrowDown', shiftKey: true });
    expect(elementBox(container, 'n1')!.style.top).toBe('55%');

    fireEvent.keyDown(surface, { key: 'Delete' });
    expect(elementBox(container, 'n1')).toBeNull();
    fireEvent.keyDown(surface, { key: 'z', metaKey: true });
    expect(elementBox(container, 'n1')).not.toBeNull();
    fireEvent.keyDown(surface, { key: 'z', metaKey: true, shiftKey: true });
    expect(elementBox(container, 'n1')).toBeNull();
    expect(elementBox(container, 'n2')).not.toBeNull();
  });

  it('lets a custom toolbar replace the plain one', () => {
    renderSurface({ toolbar: (c) => <div data-testid='custom'>{c.tools().length}</div> });
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.getByTestId('custom').textContent).toBe('14');
  });

  it('asks before discarding changes', () => {
    const first = renderSurface();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(first.onDiscard).toHaveBeenCalledTimes(1);
    cleanup();
    const second = renderSurface();
    select(second.container, 'n1');
    fireEvent.keyDown(screen.getByRole('application'), { key: 'Delete' });
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    screen.getByText('Discard this Margin?');
    expect(second.onDiscard).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard Margin' }));
    expect(second.onDiscard).toHaveBeenCalledTimes(1);
  });
});
