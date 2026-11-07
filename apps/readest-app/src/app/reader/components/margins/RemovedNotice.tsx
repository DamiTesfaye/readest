import { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { scalars } from '@/services/margins/payload';
import { type MyPost, PublicApiError, publicApi } from '@/services/margins/public/api';
import { refreshMyPosts } from '@/services/margins/public/myPosts';

export type RemovalAction = 'appeal' | 'counterNotice';

const APPEAL_MAX = 1000;
const FIELDS = ['name', 'email', 'phone', 'address', 'statement', 'signature'] as const;
type Field = (typeof FIELDS)[number];

const isOpen = (until: string | null) => !!until && Date.parse(until) > Date.now();

export const useRemovalCopy = () => {
  const _ = useTranslation();
  const reasons: Record<string, string> = {
    spam: _('Removed: spam'),
    harassment: _('Removed: harassment'),
    sexual: _('Removed: sexual content'),
    violence_self_harm: _('Removed: violence or self-harm'),
    misinformation: _('Removed: misinformation'),
    impersonation: _('Removed: impersonation'),
  };
  return (post: MyPost): { line: string; action: RemovalAction | null } => {
    if (post.reason === 'csam') return { line: _('Removed for violating our rules'), action: null };
    if (post.reason === 'copyright')
      return {
        line: _('Removed after a copyright notice about {{work}}', { work: post.noticeWork ?? '' }),
        action: isOpen(post.counterNoticeUntil) ? 'counterNotice' : null,
      };
    return {
      line: reasons[post.reason ?? ''] ?? _('Removed by a moderator'),
      action: isOpen(post.appealUntil) && post.appealState === 'none' ? 'appeal' : null,
    };
  };
};

interface RemovedNoticeProps {
  post: MyPost;
  action: RemovalAction;
  onDone(): void;
}

const RemovedNotice: React.FC<RemovedNoticeProps> = ({ post, action, onDone }) => {
  const _ = useTranslation();
  const [text, setText] = useState('');
  const [form, setForm] = useState<Record<Field, string>>(
    () => Object.fromEntries(FIELDS.map((f) => [f, ''])) as Record<Field, string>,
  );
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const labels: Record<Field, string> = {
    name: _('Full name'),
    email: _('Email'),
    phone: _('Phone'),
    address: _('Address'),
    statement: _('Statement'),
    signature: _('Signature'),
  };
  const appealLen = scalars(text.trim());
  const canSend =
    !busy &&
    (action === 'appeal'
      ? appealLen >= 1 && appealLen <= APPEAL_MAX
      : consent && FIELDS.every((f) => form[f].trim()));

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      if (action === 'appeal') await publicApi.appeal(post.id, text.trim());
      else await publicApi.counterNotice(post.id, { ...form, consent });
      await refreshMyPosts();
      onDone();
    } catch (e) {
      setError(
        e instanceof PublicApiError && e.code === 'already_appealed'
          ? _("You've already appealed this removal.")
          : _("This couldn't be sent. Try again."),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='flex flex-col gap-2 text-xs'>
      {action === 'appeal' ? (
        <label className='flex flex-col gap-1'>
          {_('Why should this Margin come back?')}
          <textarea
            className='textarea textarea-bordered textarea-sm'
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
      ) : (
        <>
          {FIELDS.map((f) => (
            <label key={f} className='flex flex-col gap-1'>
              {labels[f]}
              <input
                className='input input-bordered input-xs'
                value={form[f]}
                onChange={(e) => setForm({ ...form, [f]: e.target.value })}
              />
            </label>
          ))}
          <label className='flex items-center gap-2'>
            <input
              type='checkbox'
              className='checkbox checkbox-xs'
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            {_('I confirm the statements above')}
          </label>
        </>
      )}
      {error && (
        <p role='status' className='text-error'>
          {error}
        </p>
      )}
      <div className='flex gap-1'>
        <button
          type='button'
          className='btn btn-primary btn-xs'
          disabled={!canSend}
          onClick={() => void send()}
        >
          {action === 'appeal' ? _('Send appeal') : _('Send counter-notice')}
        </button>
        <button type='button' className='btn btn-ghost btn-xs' onClick={onDone}>
          {_('Cancel')}
        </button>
      </div>
    </div>
  );
};

export default RemovedNotice;
