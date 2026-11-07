'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { getApiBase } from '@/services/ampleread';

export const COPYRIGHT_LEGAL_TEXT = '';

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
const URLS_MAX = 20;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Turnstile {
  render(el: HTMLElement, o: { sitekey: string; callback(token: string): void }): string;
  reset(id: string): void;
}

const turnstile = () => (window as unknown as { turnstile?: Turnstile }).turnstile;

const TEXT_FIELDS = ['name', 'email', 'address', 'work', 'urls', 'signature'] as const;
type TextField = (typeof TEXT_FIELDS)[number];
type Outcome = 'sent' | 'invalid' | 'limited' | 'failed';

const CopyrightForm = () => {
  const _ = useTranslation();
  const siteKey = process.env['NEXT_PUBLIC_TURNSTILE_SITE_KEY'];
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [fields, setFields] = useState<Record<TextField, string>>(
    () => Object.fromEntries(TEXT_FIELDS.map((f) => [f, ''])) as Record<TextField, string>,
  );
  const [goodFaith, setGoodFaith] = useState(false);
  const [accurate, setAccurate] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const mountWidget = useCallback(() => {
    const t = turnstile();
    if (!siteKey || !t || !box.current || widget.current) return;
    widget.current = t.render(box.current, { sitekey: siteKey, callback: setToken });
  }, [siteKey]);

  useEffect(mountWidget, [mountWidget]);

  const urls = fields.urls
    .split('\n')
    .map((u) => u.trim())
    .filter(Boolean);
  const valid =
    TEXT_FIELDS.every((f) => fields[f].trim()) &&
    EMAIL.test(fields.email.trim()) &&
    urls.length <= URLS_MAX &&
    goodFaith &&
    accurate;

  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${getApiBase()}/v1/legal/copyright`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: fields.name.trim(),
          email: fields.email.trim(),
          address: fields.address.trim(),
          work: fields.work.trim(),
          urls,
          goodFaith,
          accurate,
          signature: fields.signature.trim(),
          turnstileToken: token,
        }),
      });
      setOutcome(
        res.ok
          ? 'sent'
          : res.status === 400
            ? 'invalid'
            : res.status === 429
              ? 'limited'
              : 'failed',
      );
      if (res.ok) return;
    } catch {
      setOutcome('failed');
    } finally {
      setBusy(false);
    }
    setToken(null);
    if (widget.current) turnstile()?.reset(widget.current);
  };

  if (outcome === 'sent') return <p role='status'>{_('We received your notice.')}</p>;

  const input = (field: TextField, label: string, multiline = false) => {
    const props = {
      'aria-label': label,
      value: fields[field],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setFields((f) => ({ ...f, [field]: e.target.value })),
    };
    return (
      <label className='form-control w-full gap-1'>
        <span className='text-sm'>{label}</span>
        {multiline ? (
          <textarea className='textarea textarea-bordered' rows={4} {...props} />
        ) : (
          <input className='input input-bordered' {...props} />
        )}
      </label>
    );
  };

  const checkbox = (label: string, checked: boolean, set: (v: boolean) => void) => (
    <label className='flex items-start gap-2 text-sm'>
      <input
        type='checkbox'
        className='checkbox checkbox-sm'
        checked={checked}
        onChange={(e) => set(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );

  return (
    <form
      className='flex flex-col gap-3'
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      {COPYRIGHT_LEGAL_TEXT && (
        <p data-testid='copyright-legal-text' className='text-sm'>
          {COPYRIGHT_LEGAL_TEXT}
        </p>
      )}
      {input('name', _('Your name'))}
      {input('email', _('Email'))}
      {input('address', _('Address'), true)}
      {input('work', _('The copyrighted work'), true)}
      {input('urls', _('Post URLs, one per line'), true)}
      {checkbox(
        _('I have a good faith belief that this use is not authorised by the owner or the law.'),
        goodFaith,
        setGoodFaith,
      )}
      {checkbox(
        _(
          'This notice is accurate, and under penalty of perjury I am the owner or may act for them.',
        ),
        accurate,
        setAccurate,
      )}
      {input('signature', _('Signature (type your full name)'))}
      {siteKey ? (
        <>
          <Script src={TURNSTILE_SRC} onReady={mountWidget} />
          <div ref={box} />
        </>
      ) : (
        <p role='status'>{_('The copyright form is not available yet.')}</p>
      )}
      {outcome === 'invalid' && <p role='alert'>{_('Check the form and try again.')}</p>}
      {outcome === 'limited' && (
        <p role='alert'>{_('Too many notices from this network. Try again later.')}</p>
      )}
      {outcome === 'failed' && <p role='alert'>{_("Couldn't send the notice. Try again.")}</p>}
      <button
        type='submit'
        className='btn btn-primary'
        disabled={!valid || !token || !siteKey || busy}
      >
        {_('Send notice')}
      </button>
    </form>
  );
};

export default CopyrightForm;
