import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import StatusBadge from '@/app/library/components/StatusBadge';

describe('StatusBadge', () => {
  it('renders children for the abandoned status', () => {
    const { queryByText } = render(<StatusBadge status='abandoned'>On hold</StatusBadge>);
    expect(queryByText('On hold')).not.toBeNull();
  });

  it('renders the tick icon and keeps the label readable for the finished status', () => {
    const { container } = render(<StatusBadge status='finished'>Finished</StatusBadge>);
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.getAttribute('role')).toBe('status');
    expect(badge.querySelector('img')?.getAttribute('src')).toContain('finished-tick.svg');
    expect(badge.textContent).toBe('Finished');
  });

  it('renders nothing for the reading status', () => {
    const { container } = render(<StatusBadge status='reading'>x</StatusBadge>);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when status is undefined', () => {
    const { container } = render(<StatusBadge>x</StatusBadge>);
    expect(container.firstChild).toBeNull();
  });
});
