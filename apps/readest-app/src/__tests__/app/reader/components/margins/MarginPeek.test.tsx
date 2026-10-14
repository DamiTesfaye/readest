import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MarginPeek, { MARGINS_PEEK_EVENT } from '@/app/reader/components/margins/MarginPeek';
import type { LayerRow } from '@/services/margins/store';
import type { Anchor } from '@/services/margins/types';
import { eventDispatcher } from '@/utils/event';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));

const creator = {
  name: 'Dami Tesfaye',
  avatarUrl: 'https://cdn.example/a.png',
  color: '#E8846B',
  initial: 'D',
};

const row: LayerRow = {
  id: 'm1',
  fileHash: 'h1',
  textId: null,
  anchor: { quote: { exact: 'He lay motionless' } } as unknown as Anchor,
  kind: 'clip',
  payload: {
    v: 1,
    ground: 'ink',
    quote: { frame: { x: 0.5, y: 0.4, w: 0.8, r: 0 }, size: 'm', italic: true },
    elements: [],
  },
  rev: 1,
  deleted: false,
};

const show = (detail: object) =>
  act(async () => {
    await eventDispatcher.dispatch(MARGINS_PEEK_EVENT, detail);
  });

afterEach(cleanup);

describe('MarginPeek', () => {
  it('lays the Margin over the passage like a post: creator, then the card art', async () => {
    render(<MarginPeek bookKey='b1' />);
    expect(screen.queryByRole('tooltip')).toBeNull();
    await show({ bookKey: 'b1', peek: { creator, row }, x: 120, y: 80 });
    const post = screen.getByRole('tooltip');
    expect(post.textContent).toContain('Dami Tesfaye');
    expect(post.querySelector('img')!.getAttribute('src')).toBe(creator.avatarUrl);
    const quote = post.querySelector('blockquote')!;
    expect(quote.textContent).toBe('He lay motionless');
    expect(quote.style.fontStyle).toBe('italic');
    expect(post.style.left).toBe('120px');
    expect(post.style.top).toBe('80px');
    await show({ bookKey: 'b1', peek: null });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('shows only the creator for a Margin without card art', async () => {
    render(<MarginPeek bookKey='b1' />);
    await show({ bookKey: 'b1', peek: { creator, row: { ...row, payload: {} } }, x: 0, y: 0 });
    const post = screen.getByRole('tooltip');
    expect(post.textContent).toContain('Dami Tesfaye');
    expect(post.querySelector('blockquote')).toBeNull();
  });

  it("falls back to the initial on the creator's colour when the picture fails", async () => {
    render(<MarginPeek bookKey='b1' />);
    await show({ bookKey: 'b1', peek: { creator, row }, x: 0, y: 0 });
    fireEvent.error(screen.getByRole('tooltip').querySelector('img')!);
    expect(screen.getByRole('tooltip').querySelector('img')).toBeNull();
    expect(screen.getByRole('tooltip').textContent).toContain('D');
  });

  it('ignores other books', async () => {
    render(<MarginPeek bookKey='b1' />);
    await show({ bookKey: 'b2', peek: { creator, row }, x: 0, y: 0 });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
