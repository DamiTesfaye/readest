import { useEffect, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useMarginsPublic } from '@/services/margins/public/flag';
import { type BlockedAccount, type HiddenBook, socialApi } from '@/services/margins/public/social';
import { SectionTitle } from '../primitives';

const ROW = 'flex items-center justify-between gap-2 py-1 text-sm';
const BUTTON = 'btn btn-ghost btn-xs';

const BlockedAccounts = () => {
  const _ = useTranslation();
  const on = useMarginsPublic();
  const [blocks, setBlocks] = useState<BlockedAccount[] | null>(null);
  const [hidden, setHidden] = useState<HiddenBook[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!on) return;
    let live = true;
    Promise.all([socialApi.blocks(), socialApi.hiddenBooks()])
      .then(([b, h]) => {
        if (!live) return;
        setBlocks(b);
        setHidden(h);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [on]);

  const run = async (change: () => Promise<void>, done: () => void) => {
    setFailed(false);
    try {
      await change();
      done();
    } catch {
      setFailed(true);
    }
  };

  const unblock = (handle: string) =>
    run(
      () => socialApi.unblock(handle),
      () => setBlocks((b) => b?.filter((x) => x.handle !== handle) ?? null),
    );

  const showAgain = (textId: string) =>
    run(
      () => socialApi.unhideBook(textId),
      () => setHidden((h) => h?.filter((x) => x.textId !== textId) ?? null),
    );

  if (!on) return null;

  return (
    <div className='space-y-4'>
      <section className='space-y-1'>
        <SectionTitle>{_('Blocked accounts')}</SectionTitle>
        {blocks?.length === 0 ? (
          <p className='text-base-content/60 text-sm'>{_("You haven't blocked anyone")}</p>
        ) : (
          <ul aria-label={_('Blocked accounts')}>
            {blocks?.map((b) => (
              <li key={b.handle} className={ROW}>
                <span className='flex flex-col leading-tight'>
                  <span>{b.displayName}</span>
                  <span className='text-base-content/60 text-xs'>{`@${b.handle}`}</span>
                </span>
                <button
                  type='button'
                  className={BUTTON}
                  aria-label={_('Unblock @{{handle}}', { handle: b.handle })}
                  onClick={() => void unblock(b.handle)}
                >
                  {_('Unblock')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className='space-y-1'>
        <SectionTitle>{_('Hidden books')}</SectionTitle>
        <ul aria-label={_('Hidden books')}>
          {hidden?.map((b) => (
            <li key={b.textId} className={ROW}>
              <span>{b.title ?? _('Untitled book')}</span>
              <button type='button' className={BUTTON} onClick={() => void showAgain(b.textId)}>
                {_('Show again')}
              </button>
            </li>
          ))}
        </ul>
      </section>
      {failed && (
        <p role='alert' className='text-error text-sm'>
          {_("This couldn't be updated. Try again.")}
        </p>
      )}
    </div>
  );
};

export default BlockedAccounts;
