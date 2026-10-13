'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { getSession } from '@/services/ampleread/auth/session';
import {
  type AdminAction,
  PublicApiError,
  publicApi,
  type QueueItem,
} from '@/services/margins/public/api';
import PostCard from '@/app/reader/components/margins/PostCard';

type Queue = QueueItem[] | 'unavailable';

const CardImage = ({ postId, assetRef }: { postId: string; assetRef: string }) => {
  const _ = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    publicApi
      .postAssetUrl(postId, assetRef)
      .then((url) => live && setSrc(url))
      .catch(() => console.error('Margins: card read failed'));
    return () => {
      live = false;
    };
  }, [postId, assetRef]);
  return src ? <img src={src} alt={_('Preview card')} className='w-64 rounded' /> : null;
};

const useActions = (item: QueueItem) => {
  const _ = useTranslation();
  if (item.kind === 'csam') return [[_('Mark reported'), { action: 'csam_reported' }]] as const;
  const countered = item.notices.some((n) => n.state === 'countered' && !n.restoreAfter);
  const actions: [string, AdminAction][] = [
    [_('Dismiss'), { action: 'dismiss' }],
    [_('Hide'), { action: 'hide' }],
    [_('Remove'), { action: 'remove' }],
    [_('Remove and suspend 7 days'), { action: 'remove_suspend', days: 7 }],
    [_('Remove and suspend 30 days'), { action: 'remove_suspend', days: 30 }],
    [_('Remove and suspend permanently'), { action: 'remove_suspend', days: null }],
    [_('Restore'), { action: 'restore' }],
  ];
  if (item.notices.length) actions.push([_('Court action'), { action: 'court_action' }]);
  if (countered) actions.push([_('Counter-notice forwarded'), { action: 'counter_forwarded' }]);
  if (item.appeal !== null) actions.push([_('Deny appeal'), { action: 'deny_appeal' }]);
  actions.push([_('Lift suspension'), { action: 'unsuspend' }]);
  actions.push([_('Reset profile'), { action: 'reset_profile' }]);
  return actions;
};

const ItemDetails = ({ item }: { item: QueueItem }) => {
  const _ = useTranslation();
  const { creator, text } = item;
  const title = `${text.title ?? _('Untitled')}${text.titleVerified ? '' : ` (${_('unverified')})`}`;
  return (
    <>
      {item.post && <PostCard post={item.post} signedIn={false} />}
      {item.cardAsset && <CardImage postId={item.postId} assetRef={item.cardAsset} />}
      <ul className='text-sm'>
        {item.reports.map((r, i) => (
          <li
            key={i}
          >{`${r.reason}${r.established ? ` · ${_('established')}` : ''}: ${r.text ?? ''}`}</li>
        ))}
      </ul>
      {item.notices.map((n) => (
        <div key={n.id} className='text-sm'>
          <p>{`${n.work} · ${n.claimantName} <${n.claimantEmail}> · ${n.state}`}</p>
          {n.counter && (
            <ul>
              {Object.entries(n.counter).map(([k, v]) => (
                <li key={k}>{`${k}: ${String(v)}`}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
      {item.appeal !== null && <p className='text-sm'>{`${_('Appeal')}: ${item.appeal}`}</p>}
      <p className='text-sm'>
        {_(
          '@{{handle}} · {{posts}} posts · {{upheld}} upheld reports · {{age}} days old · {{suspensions}} suspensions',
          {
            handle: creator.handle,
            posts: creator.posts,
            upheld: creator.upheldReports,
            age: creator.accountAgeDays,
            suspensions: creator.suspensions,
          },
        )}
      </p>
      <p className='text-sm'>
        {[title, text.capped ? _('capped') : _('uncapped'), text.license]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </>
  );
};

const QueueEntry = ({ item, onChange }: { item: QueueItem; onChange(next: QueueItem): void }) => {
  const _ = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const actions = useActions(item);

  const run = async (body: AdminAction) => {
    setError(null);
    try {
      onChange(await publicApi.adminAction(item.postId, body));
    } catch (e) {
      setError(
        e instanceof PublicApiError && e.code === 'crowd_cap_reached'
          ? _("Restoring would go over this book's public quote limit.")
          : _('That action failed. Try again.'),
      );
    }
  };

  return (
    <section aria-label={item.postId} className='bg-base-100 flex flex-col gap-2 rounded-lg p-4'>
      {item.kind === 'csam' ? (
        <p className='text-sm'>{`${item.postId} · @${item.creator.handle} · ${item.createdAt}`}</p>
      ) : (
        <>
          <p className='text-xs uppercase'>{`${item.kind} · ${item.status}`}</p>
          <ItemDetails item={item} />
        </>
      )}
      <div className='flex flex-wrap gap-1'>
        {actions.map(([label, body]) => (
          <button key={label} type='button' className='btn btn-xs' onClick={() => void run(body)}>
            {label}
          </button>
        ))}
      </div>
      {error && <p role='alert'>{error}</p>}
    </section>
  );
};

const loadQueue = async (): Promise<Queue> => {
  if (process.env['NEXT_PUBLIC_APP_PLATFORM'] !== 'web' || !(await getSession()))
    return 'unavailable';
  return publicApi.adminQueue();
};

const ModerationQueue = () => {
  const _ = useTranslation();
  const [queue, setQueue] = useState<Queue | null>(null);

  useEffect(() => {
    let live = true;
    loadQueue()
      .then((q) => live && setQueue(q))
      .catch(() => live && setQueue('unavailable'));
    return () => {
      live = false;
    };
  }, []);

  const replace = (next: QueueItem) =>
    setQueue((q) =>
      Array.isArray(q)
        ? next.kind === 'none'
          ? q.filter((i) => i.postId !== next.postId)
          : q.map((i) => (i.postId === next.postId ? next : i))
        : q,
    );

  if (queue === null) return null;
  if (queue === 'unavailable') return <p>{_('Not available.')}</p>;
  return (
    <div className='flex flex-col gap-4'>
      {queue.map((item) => (
        <QueueEntry key={item.postId} item={item} onChange={replace} />
      ))}
    </div>
  );
};

export default ModerationQueue;
