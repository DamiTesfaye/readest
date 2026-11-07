import clsx from 'clsx';
import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { scalars } from '@/services/margins/payload';
import { type Profile, PublicApiError, publicApi } from '@/services/margins/public/api';

export interface HandleSheetProps {
  onDone(p: Profile): void;
  onClose(): void;
}

const HANDLE = /^[a-z0-9_]{3,20}$/;
const NAME_MAX = 50;

export const SHEET_CLASS = clsx(
  'bg-base-100 text-base-content border-base-content/10 fixed z-50 flex flex-col gap-3 border p-4 shadow-xl',
  'inset-x-0 bottom-0 rounded-t-2xl',
  'sm:inset-x-auto sm:bottom-auto sm:right-6 sm:top-16 sm:w-96 sm:rounded-2xl',
);

const HandleSheet: React.FC<HandleSheetProps> = ({ onDone, onClose }) => {
  const _ = useTranslation();
  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleOk = HANDLE.test(handle);
  const nameLen = scalars(name.trim());
  const canSave = handleOk && nameLen >= 1 && nameLen <= NAME_MAX && !busy;

  const copy: Record<string, string> = {
    handle_taken: _('That handle is taken.'),
    handle_reserved: _('That handle is reserved.'),
    handle_change_too_soon: _('You can change your handle once every 30 days.'),
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onDone(await publicApi.saveProfile(handle, name.trim()));
    } catch (e) {
      const code = e instanceof PublicApiError ? e.code : null;
      setError((code && copy[code]) || _("Couldn't save your profile. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role='dialog' aria-label={_('Choose a handle')} className={SHEET_CLASS}>
      <p className='text-sm font-semibold'>{_('Choose a handle')}</p>
      <label className='flex flex-col gap-1 text-xs'>
        {_('Handle')}
        <input
          className='input input-bordered input-sm'
          value={handle}
          autoCapitalize='none'
          onChange={(e) => setHandle(e.target.value.trim().toLowerCase())}
        />
      </label>
      {handle && !handleOk && (
        <p className='text-error text-xs'>{_('Use 3–20 letters, numbers or underscores.')}</p>
      )}
      <label className='flex flex-col gap-1 text-xs'>
        {_('Display name')}
        <input
          className='input input-bordered input-sm'
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {error && (
        <p role='status' className='text-error text-xs'>
          {error}
        </p>
      )}
      <div className='flex justify-end gap-2'>
        <button type='button' className='btn btn-ghost btn-sm' onClick={onClose}>
          {_('Cancel')}
        </button>
        <button
          type='button'
          className='btn btn-primary btn-sm'
          disabled={!canSave}
          onClick={() => void save()}
        >
          {_('Save')}
        </button>
      </div>
    </div>
  );
};

export default HandleSheet;
