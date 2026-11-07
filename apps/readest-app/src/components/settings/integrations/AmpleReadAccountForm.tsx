import clsx from 'clsx';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { getSession, onSessionChange, type StoredSession } from '@/services/ampleread/auth/session';
import {
  requestEmailCode,
  signInWithProvider,
  signOut,
  verifyEmailCode,
  type HandoffRecord,
} from '@/services/ampleread/auth/signIn';
import SubPageHeader from '../SubPageHeader';
import BlockedAccounts from './BlockedAccounts';
import { SectionTitle } from '../primitives';

interface AmpleReadAccountFormProps {
  onBack: () => void;
}

const INPUT_CLASS = 'input input-bordered eink-bordered h-11 w-full text-sm focus:outline-none';
const PRIMARY_CLASS = 'btn btn-contrast h-10 min-h-10 rounded-lg px-5 text-sm font-medium';
const SECONDARY_CLASS = 'btn eink-bordered h-10 min-h-10 w-full rounded-lg text-sm font-medium';

const errorMessage = (error: unknown): string => {
  const body = (error as { body?: { message?: string } } | null)?.body;
  return body?.message || (error instanceof Error ? error.message : String(error));
};

const AmpleReadAccountForm: React.FC<AmpleReadAccountFormProps> = ({ onBack }) => {
  const _ = useTranslation();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<HandoffRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signInAbort, setSignInAbort] = useState<AbortController | null>(null);
  const signInAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getSession().then(setSession);
    return onSessionChange(setSession);
  }, []);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      if ((err as Error | null)?.name !== 'AbortError') setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleProvider = (provider: 'google' | 'apple') => {
    const controller = new AbortController();
    signInAbortRef.current = controller;
    setSignInAbort(controller);
    return run(() => signInWithProvider(provider, controller.signal)).finally(() =>
      setSignInAbort(null),
    );
  };

  useEffect(() => () => signInAbortRef.current?.abort(), []);

  const handleSendCode = () =>
    run(async () => {
      setPending(await requestEmailCode(email));
    });

  const handleVerify = () =>
    run(async () => {
      if (!pending) return;
      await verifyEmailCode(email, code, pending);
      setPending(null);
      setCode('');
    });

  const me = session?.me;

  return (
    <div className='w-full'>
      <SubPageHeader
        parentLabel={_('Integrations')}
        currentLabel={_('AmpleRead account')}
        description={me ? _('Signed in to AmpleRead.') : _('Sign in to your AmpleRead account.')}
        onBack={onBack}
      />

      {me ? (
        <div className='space-y-5'>
          <p className='text-sm'>{me.displayName ?? me.email}</p>
          <div className='flex justify-end'>
            <button
              type='button'
              disabled={busy}
              onClick={() => run(signOut)}
              className='eink-bordered text-error hover:bg-error/10 h-10 rounded-lg px-4 text-sm font-medium'
            >
              {_('Sign out')}
            </button>
          </div>
          <BlockedAccounts />
        </div>
      ) : (
        <div className='space-y-4'>
          <button
            type='button'
            disabled={busy}
            onClick={() => handleProvider('google')}
            className={SECONDARY_CLASS}
          >
            {_('Continue with Google')}
          </button>
          <button
            type='button'
            disabled={busy}
            onClick={() => handleProvider('apple')}
            className={SECONDARY_CLASS}
          >
            {_('Continue with Apple')}
          </button>
          {signInAbort && (
            <button type='button' onClick={() => signInAbort.abort()} className={SECONDARY_CLASS}>
              {_('Cancel')}
            </button>
          )}

          <form
            className='space-y-1.5'
            onSubmit={(e) => {
              e.preventDefault();
              handleSendCode();
            }}
          >
            <SectionTitle as='label' htmlFor='ampleread-email' className='block'>
              {_('Email')}
            </SectionTitle>
            <input
              id='ampleread-email'
              type='email'
              autoComplete='email'
              className={INPUT_CLASS}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className='flex justify-end pt-1'>
              <button type='submit' disabled={busy || !email} className={PRIMARY_CLASS}>
                {_('Send code')}
              </button>
            </div>
          </form>

          {pending && (
            <form
              className='space-y-1.5'
              onSubmit={(e) => {
                e.preventDefault();
                handleVerify();
              }}
            >
              <SectionTitle as='label' htmlFor='ampleread-code' className='block'>
                {_('Code')}
              </SectionTitle>
              <input
                id='ampleread-code'
                inputMode='numeric'
                autoComplete='one-time-code'
                className={INPUT_CLASS}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <div className='flex justify-end pt-1'>
                <button
                  type='submit'
                  disabled={busy || !code}
                  className={clsx(PRIMARY_CLASS, busy && 'opacity-60')}
                >
                  {_('Verify')}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {error && (
        <p role='alert' className='text-error mt-4 text-sm'>
          {error}
        </p>
      )}
    </div>
  );
};

export default AmpleReadAccountForm;
