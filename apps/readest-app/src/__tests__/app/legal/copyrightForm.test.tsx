import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));
vi.mock('next/script', () => ({ default: () => null }));

import CopyrightForm, { COPYRIGHT_LEGAL_TEXT } from '@/app/legal/copyright/CopyrightForm';

type Turnstile = { render: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn> };
const w = window as unknown as { turnstile?: Turnstile };

const URL_1 = 'https://web.ampleread.com/m/pst_0123456789abcdef0123456789abcdef';

const fill = () => {
  const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  type('Your name', 'Ada Claimant');
  type('Email', 'ada@example.com');
  type('Address', '1 Lane, Town');
  type('The copyrighted work', 'A Book');
  type('Post URLs, one per line', `${URL_1}\n\n https://web.ampleread.com/m/pst_2 `);
  fireEvent.click(screen.getByLabelText(/good faith/));
  fireEvent.click(screen.getByLabelText(/penalty of perjury/));
  type('Signature (type your full name)', 'Ada Claimant');
};

const submit = () => screen.getByRole('button', { name: 'Send notice' }) as HTMLButtonElement;

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'site-key');
  w.turnstile = {
    render: vi.fn((_el: HTMLElement, o: { callback(t: string): void }) => {
      o.callback('tok');
      return 'widget-1';
    }),
    reset: vi.fn(),
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  delete w.turnstile;
});

describe('CopyrightForm', () => {
  it('enables Submit only when every field is valid and Turnstile passed', () => {
    render(<CopyrightForm />);
    expect(w.turnstile!.render).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ sitekey: 'site-key' }),
    );
    expect(submit().disabled).toBe(true);
    fill();
    expect(submit().disabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nope' } });
    expect(submit().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ada@example.com' } });
    const many = Array.from({ length: 21 }, (_v, i) => `${URL_1}${i}`).join('\n');
    fireEvent.change(screen.getByLabelText('Post URLs, one per line'), { target: { value: many } });
    expect(submit().disabled).toBe(true);
  });

  it('keeps Submit disabled without a Turnstile token', () => {
    w.turnstile!.render = vi.fn(() => 'widget-1');
    render(<CopyrightForm />);
    fill();
    expect(submit().disabled).toBe(true);
  });

  it('posts the notice and thanks the claimant', async () => {
    const fetchMock = vi.fn(async () => new Response('{"id":"cpn_1"}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<CopyrightForm />);
    fill();
    await act(async () => fireEvent.click(submit()));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith('/v1/legal/copyright')).toBe(true);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Ada Claimant',
      email: 'ada@example.com',
      address: '1 Lane, Town',
      work: 'A Book',
      urls: [URL_1, 'https://web.ampleread.com/m/pst_2'],
      goodFaith: true,
      accurate: true,
      signature: 'Ada Claimant',
      turnstileToken: 'tok',
    });
    screen.getByText('We received your notice.');
  });

  it.each([
    [400, 'Check the form and try again.'],
    [429, 'Too many notices from this network. Try again later.'],
  ])('shows the %i copy and resets the challenge', async (status, copy) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status })),
    );
    render(<CopyrightForm />);
    fill();
    await act(async () => fireEvent.click(submit()));
    screen.getByText(copy);
    expect(w.turnstile!.reset).toHaveBeenCalledWith('widget-1');
  });

  it('is not available without a site key', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    render(<CopyrightForm />);
    screen.getByText('The copyright form is not available yet.');
    expect(w.turnstile!.render).not.toHaveBeenCalled();
    fill();
    expect(submit().disabled).toBe(true);
  });

  it('renders no legal text until Q1 is answered', () => {
    expect(COPYRIGHT_LEGAL_TEXT).toBe('');
    render(<CopyrightForm />);
    expect(screen.queryByTestId('copyright-legal-text')).toBeNull();
  });
});
