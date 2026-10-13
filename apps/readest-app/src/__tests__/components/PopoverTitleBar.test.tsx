import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import PopoverTitleBar from '@/components/PopoverTitleBar';

afterEach(cleanup);

describe('PopoverTitleBar', () => {
  it('renders the title as a heading', () => {
    render(<PopoverTitleBar title='Library' />);
    expect(screen.getByRole('heading', { name: 'Library' })).toBeTruthy();
  });

  it('omits the divider by default and renders it when asked', () => {
    const { container, rerender } = render(<PopoverTitleBar title='Library' />);
    expect(container.querySelector('.h-px')).toBeNull();

    rerender(<PopoverTitleBar title='Contents' showDivider />);
    expect(container.querySelector('.h-px')).not.toBeNull();
  });

  it('applies dividerClassName to the divider only', () => {
    const { container } = render(
      <PopoverTitleBar title='Theme & Fonts' showDivider dividerClassName='mx-4' />,
    );
    const divider = container.querySelector('.h-px');
    expect(divider?.className).toContain('mx-4');
  });

  it('renders the end slot without removing the title from the centred row', () => {
    const { container } = render(
      <PopoverTitleBar title='Library' end={<button type='button'>Search</button>} />,
    );
    const row = container.firstElementChild as HTMLElement;

    expect(row.className).toContain('justify-center');
    expect(row.contains(screen.getByRole('heading', { name: 'Library' }))).toBe(true);

    const endWrapper = screen.getByRole('button', { name: 'Search' }).parentElement!;
    expect(endWrapper.className).toContain('absolute');
    expect(endWrapper.className).toContain('end-0');
  });
});
