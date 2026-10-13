import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { scalars } from '@/services/margins/payload';
import {
  PublicApiError,
  publicApi,
  REPORT_REASONS,
  type ReportReason,
} from '@/services/margins/public/api';
import { eventDispatcher } from '@/utils/event';
import { SHEET_CLASS } from './HandleSheet';

const TEXT_MAX = 500;

interface ReportDialogProps {
  postId: string;
  onClose(): void;
}

const ReportDialog: React.FC<ReportDialogProps> = ({ postId, onClose }) => {
  const _ = useTranslation();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const labels: Record<ReportReason, string> = {
    spam: _('Spam'),
    harassment: _('Harassment'),
    sexual: _('Sexual content'),
    violence_self_harm: _('Violence or self-harm'),
    misinformation: _('Misinformation'),
    impersonation: _('Impersonation'),
    other: _('Something else'),
  };
  const length = scalars(text.trim());

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await publicApi.report(postId, reason, text.trim() || undefined);
      eventDispatcher.dispatch('toast', { message: _('Thanks. We will review it.'), type: 'info' });
      onClose();
    } catch (e) {
      setError(
        e instanceof PublicApiError && e.code === 'already_reported'
          ? _("You've already reported this Margin.")
          : _("This couldn't be sent. Try again."),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role='dialog' aria-label={_('Report this Margin')} className={SHEET_CLASS}>
      <p className='text-sm font-semibold'>{_('Report this Margin')}</p>
      <div role='radiogroup' aria-label={_('Reason')} className='flex flex-col gap-1 text-sm'>
        {REPORT_REASONS.map((r) => (
          <label key={r} className='flex items-center gap-2'>
            <input
              type='radio'
              name={`report-${postId}`}
              className='radio radio-xs'
              checked={reason === r}
              onChange={() => setReason(r)}
            />
            {labels[r]}
          </label>
        ))}
      </div>
      <label className='flex flex-col gap-1 text-xs'>
        {_('Details (optional)')}
        <textarea
          className='textarea textarea-bordered textarea-sm'
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <span className='text-base-content/60 self-end text-xs'>{`${length}/${TEXT_MAX}`}</span>
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
          disabled={!reason || length > TEXT_MAX || busy}
          onClick={() => void send()}
        >
          {_('Send report')}
        </button>
      </div>
    </div>
  );
};

export default ReportDialog;
