import { useState } from 'react';
import { SHEET_CLASS } from '@/app/reader/components/margins/HandleSheet';
import { useTranslation } from '@/hooks/useTranslation';
import { socialApi } from '@/services/margins/public/social';

export interface BlockSheetProps {
  handle: string;
  onBlocked(): void;
  onClose(): void;
}

const BlockSheet = ({ handle, onBlocked, onClose }: BlockSheetProps) => {
  const _ = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const block = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await socialApi.block(handle);
      onBlocked();
      onClose();
    } catch {
      console.error('Margins: block failed');
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role='dialog' aria-label={_('Block @{{handle}}', { handle })} className={SHEET_CLASS}>
      <p className='text-sm'>
        {_("Block @{{handle}}? You won't see each other's Margins.", { handle })}
      </p>
      {failed && (
        <p role='status' className='text-error text-xs'>
          {_("This couldn't be sent. Try again.")}
        </p>
      )}
      <div className='flex justify-end gap-2'>
        <button type='button' className='btn btn-ghost btn-sm' onClick={onClose}>
          {_('Cancel')}
        </button>
        <button
          type='button'
          className='btn btn-error btn-sm'
          disabled={busy}
          onClick={() => void block()}
        >
          {_('Block')}
        </button>
      </div>
    </div>
  );
};

export default BlockSheet;
