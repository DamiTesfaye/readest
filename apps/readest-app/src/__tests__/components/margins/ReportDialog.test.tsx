import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ report: vi.fn(async () => {}) }));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string) => s,
}));
vi.mock('@/services/margins/public/api', async (orig) => ({
  ...(await orig<typeof import('@/services/margins/public/api')>()),
  publicApi: { report: h.report },
}));

import ReportDialog from '@/app/reader/components/margins/ReportDialog';
import { PublicApiError } from '@/services/margins/public/api';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const send = async () => {
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send report' })));
};

describe('ReportDialog', () => {
  it('lists the seven reasons as radios', () => {
    render(<ReportDialog postId='pst1' onClose={vi.fn()} />);
    expect(screen.getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual([
      'Spam',
      'Harassment',
      'Sexual content',
      'Violence or self-harm',
      'Misinformation',
      'Impersonation',
      'Something else',
    ]);
    expect(screen.getByRole('button', { name: 'Send report' })).toHaveProperty('disabled', true);
  });

  it('sends the reason and the optional text, then closes', async () => {
    const onClose = vi.fn();
    render(<ReportDialog postId='pst1' onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Impersonation'));
    await send();
    expect(h.report).toHaveBeenCalledWith('pst1', 'impersonation', undefined);
    expect(onClose).toHaveBeenCalled();
    cleanup();
    render(<ReportDialog postId='pst1' onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Something else'));
    fireEvent.change(screen.getByLabelText('Details (optional)'), { target: { value: 'odd' } });
    await send();
    expect(h.report).toHaveBeenLastCalledWith('pst1', 'other', 'odd');
  });

  it('counts the text in characters up to 500', () => {
    render(<ReportDialog postId='pst1' onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Spam'));
    const box = screen.getByLabelText('Details (optional)');
    fireEvent.change(box, { target: { value: '𝔄'.repeat(500) } });
    screen.getByText('500/500');
    expect(screen.getByRole('button', { name: 'Send report' })).toHaveProperty('disabled', false);
    fireEvent.change(box, { target: { value: '𝔄'.repeat(501) } });
    expect(screen.getByRole('button', { name: 'Send report' })).toHaveProperty('disabled', true);
  });

  it('says when the Margin was already reported', async () => {
    h.report.mockRejectedValueOnce(new PublicApiError(409, 'already_reported', null, null));
    render(<ReportDialog postId='pst1' onClose={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Spam'));
    await send();
    screen.getByText("You've already reported this Margin.");
  });
});
