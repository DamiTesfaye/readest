import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import MarginCreatorPopover, {
  MARGINS_CREATOR_EVENT,
} from '@/app/reader/components/margins/MarginCreatorPopover';
import { eventDispatcher } from '@/utils/event';

const creator = {
  name: 'Dami Tesfaye',
  avatarUrl: 'https://cdn.example/a.png',
  color: '#E8846B',
  initial: 'D',
};

const show = (detail: object) =>
  act(async () => {
    await eventDispatcher.dispatch(MARGINS_CREATOR_EVENT, detail);
  });

afterEach(cleanup);

describe('MarginCreatorPopover', () => {
  it("shows the creator's picture and name at the marker, and hides again", async () => {
    render(<MarginCreatorPopover bookKey='b1' />);
    expect(screen.queryByRole('tooltip')).toBeNull();
    await show({ bookKey: 'b1', creator, x: 120, y: 80 });
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toContain('Dami Tesfaye');
    expect(tip.querySelector('img')!.getAttribute('src')).toBe(creator.avatarUrl);
    expect(tip.style.left).toBe('120px');
    expect(tip.style.top).toBe('80px');
    await show({ bookKey: 'b1', creator: null });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it("falls back to the initial on the creator's colour when the picture fails", async () => {
    render(<MarginCreatorPopover bookKey='b1' />);
    await show({ bookKey: 'b1', creator, x: 0, y: 0 });
    fireEvent.error(screen.getByRole('tooltip').querySelector('img')!);
    const tip = screen.getByRole('tooltip');
    expect(tip.querySelector('img')).toBeNull();
    expect(tip.textContent).toContain('D');
  });

  it('ignores other books', async () => {
    render(<MarginCreatorPopover bookKey='b1' />);
    await show({ bookKey: 'b2', creator, x: 0, y: 0 });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
