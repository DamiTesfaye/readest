import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AmpleReadAccountForm from '@/components/settings/integrations/AmpleReadAccountForm';

const signIn = vi.hoisted(() => ({
  signInWithProvider: vi.fn(),
  requestEmailCode: vi.fn(),
  verifyEmailCode: vi.fn(),
  signOut: vi.fn(),
}));
const session = vi.hoisted(() => ({ getSession: vi.fn(), onSessionChange: vi.fn(() => () => {}) }));
vi.mock('@/services/ampleread/auth/signIn', () => signIn);
vi.mock('@/services/ampleread/auth/session', () => session);
vi.mock('@/components/settings/integrations/BlockedAccounts', () => ({
  default: () => <section aria-label='Blocked accounts' />,
}));

describe('AmpleReadAccountForm', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('offers Google, Apple and email when signed out', async () => {
    session.getSession.mockResolvedValue(null);
    render(<AmpleReadAccountForm onBack={() => {}} />);
    expect(await screen.findByRole('button', { name: /Google/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Apple/ })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Blocked accounts' })).toBeNull();
    expect(screen.getByLabelText(/Email/)).toBeTruthy();
  });

  it('asks for the code after sending it, then verifies with the same record', async () => {
    session.getSession.mockResolvedValue(null);
    const rec = { req: 'r', verifier: 'v', returnTo: 'x' };
    signIn.requestEmailCode.mockResolvedValue(rec);
    render(<AmpleReadAccountForm onBack={() => {}} />);
    fireEvent.change(await screen.findByLabelText(/Email/), { target: { value: 'a@b.c' } });
    fireEvent.click(screen.getByRole('button', { name: /Send code/ }));
    fireEvent.change(await screen.findByLabelText(/Code/), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /Verify/ }));
    await waitFor(() =>
      expect(signIn.verifyEmailCode).toHaveBeenCalledWith('a@b.c', '123456', rec),
    );
  });

  it('shows the account and signs out', async () => {
    session.getSession.mockResolvedValue({ me: { email: 'a@b.c', displayName: null } });
    render(<AmpleReadAccountForm onBack={() => {}} />);
    expect(await screen.findByText('a@b.c')).toBeTruthy();
    screen.getByRole('region', { name: 'Blocked accounts' });
    fireEvent.click(screen.getByRole('button', { name: /Sign out/ }));
    await waitFor(() => expect(signIn.signOut).toHaveBeenCalled());
  });

  it('shows the server message when sign-in fails', async () => {
    session.getSession.mockResolvedValue(null);
    signIn.signInWithProvider.mockRejectedValue(
      Object.assign(new Error('x'), { body: { message: 'Sign-in was cancelled.' } }),
    );
    render(<AmpleReadAccountForm onBack={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /Google/ }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Sign-in was cancelled.',
    );
  });

  it('cancels a pending browser sign-in and frees the form', async () => {
    session.getSession.mockResolvedValue(null);
    let signal: AbortSignal | undefined;
    signIn.signInWithProvider.mockImplementation(
      (_provider: string, s: AbortSignal) =>
        new Promise((_, reject) => {
          signal = s;
          s.addEventListener('abort', () => reject(s.reason));
        }),
    );
    render(<AmpleReadAccountForm onBack={() => {}} />);
    const google = await screen.findByRole('button', { name: /Google/ });
    expect(screen.queryByRole('button', { name: /Cancel/ })).toBeNull();
    fireEvent.click(google);
    fireEvent.click(await screen.findByRole('button', { name: /Cancel/ }));
    expect(signal?.aborted).toBe(true);
    await waitFor(() => expect(google).toHaveProperty('disabled', false));
    expect(screen.queryByRole('button', { name: /Cancel/ })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
