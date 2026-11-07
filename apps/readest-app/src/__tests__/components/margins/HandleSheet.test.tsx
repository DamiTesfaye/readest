import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ saveProfile: vi.fn() }));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, opts?: Record<string, string | number>) =>
    opts ? s.replace(/\{\{(\w+)\}\}/g, (_m, key) => String(opts[key] ?? '')) : s,
}));
vi.mock('@/services/margins/public/api', async (orig) => ({
  ...(await orig<typeof import('@/services/margins/public/api')>()),
  publicApi: { saveProfile: h.saveProfile },
}));

import HandleSheet from '@/app/reader/components/margins/HandleSheet';
import { PublicApiError } from '@/services/margins/public/api';

const profile = { handle: 'reader_1', displayName: 'Reader', handleChangedAt: '2026-10-13' };

const fill = (handle: string, name = 'Reader') => {
  fireEvent.change(screen.getByLabelText('Handle'), { target: { value: handle } });
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: name } });
};

const save = async () => {
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('HandleSheet', () => {
  it('normalises the handle and saves the profile', async () => {
    const onDone = vi.fn();
    h.saveProfile.mockResolvedValue(profile);
    render(<HandleSheet onDone={onDone} onClose={vi.fn()} />);
    fill('Reader_1');
    expect((screen.getByLabelText('Handle') as HTMLInputElement).value).toBe('reader_1');
    await save();
    expect(h.saveProfile).toHaveBeenCalledWith('reader_1', 'Reader');
    expect(onDone).toHaveBeenCalledWith(profile);
  });

  it.each([
    ['handle_taken', 'That handle is taken.'],
    ['handle_reserved', 'That handle is reserved.'],
    ['handle_change_too_soon', 'You can change your handle once every 30 days.'],
  ])('maps %s to its copy', async (code, copy) => {
    h.saveProfile.mockRejectedValue(new PublicApiError(409, code, null, null));
    render(<HandleSheet onDone={vi.fn()} onClose={vi.fn()} />);
    fill('reader_1');
    await save();
    screen.getByText(copy);
  });

  it('refuses a malformed handle locally', () => {
    render(<HandleSheet onDone={vi.fn()} onClose={vi.fn()} />);
    fill('ab');
    screen.getByText('Use 3–20 letters, numbers or underscores.');
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
  });

  it('disables Save for a display name over 50 characters', () => {
    render(<HandleSheet onDone={vi.fn()} onClose={vi.fn()} />);
    fill('reader_1', '𝔄'.repeat(51));
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
    fill('reader_1', '𝔄'.repeat(50));
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false);
  });
});
