import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MoreMenuButton from '@/app/reader/components/MoreMenuButton';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));

const renderButton = (isReadingRulerActive: boolean) => {
  const onToggleMore = vi.fn();
  const onCloseReadingRuler = vi.fn();
  render(
    <MoreMenuButton
      isReadingRulerActive={isReadingRulerActive}
      isMoreOpen={false}
      iconColor='#D9D9D9'
      onToggleMore={onToggleMore}
      onCloseReadingRuler={onCloseReadingRuler}
    />,
  );
  return { onToggleMore, onCloseReadingRuler };
};

describe('MoreMenuButton', () => {
  afterEach(cleanup);

  it('opens the More menu from the hamburger shape', () => {
    const { onToggleMore, onCloseReadingRuler } = renderButton(false);

    const button = screen.getByRole('button', { name: 'More' });
    expect(button.dataset['shape']).toBe('menu');

    fireEvent.click(button);
    expect(onToggleMore).toHaveBeenCalledTimes(1);
    expect(onCloseReadingRuler).not.toHaveBeenCalled();
  });

  it('becomes a close button that turns the reading ruler off while it is active', () => {
    const { onToggleMore, onCloseReadingRuler } = renderButton(true);

    const button = screen.getByRole('button', { name: 'Close' });
    expect(button.dataset['shape']).toBe('close');
    expect(button.getAttribute('aria-expanded')).toBeNull();

    fireEvent.click(button);
    expect(onCloseReadingRuler).toHaveBeenCalledTimes(1);
    expect(onToggleMore).not.toHaveBeenCalled();
  });

  it('draws the three bars in the icon color', () => {
    renderButton(false);

    const bars = screen.getByRole('button', { name: 'More' }).querySelectorAll('rect');
    expect(bars).toHaveLength(3);
    bars.forEach((bar) => expect(bar.getAttribute('fill')).toBe('#D9D9D9'));
  });

  it('drops the morph transition when the UI animations setting is off, not only the OS one', () => {
    renderButton(true);

    const bars = screen.getByRole('button', { name: 'Close' }).querySelectorAll('rect');
    bars.forEach((bar) => {
      expect(bar.getAttribute('class')).toContain('anim-off:transition-none');
      expect(bar.getAttribute('class')).not.toContain('motion-reduce:');
    });
  });
});
