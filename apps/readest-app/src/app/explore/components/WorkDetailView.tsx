'use client';

import { useCallback, useEffect, useState } from 'react';

import { useTranslation } from '@/hooks/useTranslation';
import { getWorkDetail, isNotFoundError, refresh, trackEvent } from '@/services/ampleread';
import type { EditionView, WorkDetail } from '@/services/ampleread';

interface WorkDetailViewProps {
  workId: string;
  onBack: () => void;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; detail: WorkDetail }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

const EditionRow = ({ edition }: { edition: EditionView }) => (
  <li className='border-base-300 flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-3 text-sm'>
    <span className='font-medium'>{edition.sourceName}</span>
    <span className='badge badge-ghost badge-sm uppercase'>{edition.language}</span>
    <span className='badge badge-outline badge-sm'>{edition.mediaType}</span>
    {edition.attribution && (
      <span className='text-base-content/60 basis-full text-xs'>{edition.attribution}</span>
    )}
  </li>
);

export default function WorkDetailView({ workId, onBack }: WorkDetailViewProps) {
  const _ = useTranslation();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      await refresh(`work:${workId}`);
      const detail = await getWorkDetail(workId);
      setState({ status: 'ready', detail });
      void trackEvent({ kind: 'open', workId });
    } catch (err) {
      if (isNotFoundError(err)) {
        setState({ status: 'not-found' });
        return;
      }
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }, [workId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className='work-detail px-4 py-6'>
      <button type='button' className='btn btn-sm btn-ghost mb-4' onClick={onBack}>
        {_('Back')}
      </button>

      {state.status === 'loading' && (
        <div className='flex items-center justify-center py-12'>
          <span className='loading loading-spinner loading-lg' />
        </div>
      )}

      {state.status === 'not-found' && (
        <p className='text-base-content/70 py-12 text-center'>
          {_('This book is no longer available.')}
        </p>
      )}

      {state.status === 'error' && (
        <div className='py-12 text-center'>
          <p className='text-error mb-4'>{state.message}</p>
          <button type='button' className='btn btn-primary btn-sm' onClick={load}>
            {_('Retry')}
          </button>
        </div>
      )}

      {state.status === 'ready' && (
        <article>
          <h1 className='mb-2 text-2xl font-bold'>{state.detail.title}</h1>
          {state.detail.description && (
            <p className='text-base-content/80 mb-4 whitespace-pre-line'>
              {state.detail.description}
            </p>
          )}
          {state.detail.subjects.length > 0 && (
            <div className='mb-6 flex flex-wrap gap-2'>
              {state.detail.subjects.map((subject) => (
                <span key={subject} className='badge badge-outline'>
                  {subject}
                </span>
              ))}
            </div>
          )}
          <h2 className='mb-1 text-lg font-semibold'>{_('Editions')}</h2>
          <ul>
            {state.detail.editions.map((edition) => (
              <EditionRow key={edition.id} edition={edition} />
            ))}
          </ul>
        </article>
      )}
    </div>
  );
}
