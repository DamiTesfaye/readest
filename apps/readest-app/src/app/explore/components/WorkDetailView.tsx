'use client';

import { useCallback, useEffect, useState } from 'react';

import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import {
  canDownloadEdition,
  getWorkDetail,
  isNotFoundError,
  refresh,
  trackEvent,
} from '@/services/ampleread';
import { downloadEdition } from '@/services/ampleread/download';
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

type DownloadNotice = { tone: 'info' | 'success' | 'error'; message: string };

interface EditionRowProps {
  edition: EditionView;
  busy: boolean;
  onDownload: (edition: EditionView) => void;
  downloadLabel: string;
}

const EditionRow = ({ edition, busy, onDownload, downloadLabel }: EditionRowProps) => (
  <li className='border-base-300 flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-3 text-sm'>
    <span className='font-medium'>{edition.sourceName}</span>
    <span className='badge badge-ghost badge-sm uppercase'>{edition.language}</span>
    <span className='badge badge-outline badge-sm'>{edition.mediaType}</span>
    {canDownloadEdition(edition) && (
      <button
        type='button'
        className='btn btn-xs btn-primary ms-auto'
        disabled={busy}
        onClick={() => onDownload(edition)}
      >
        {downloadLabel}
      </button>
    )}
    {edition.attribution && (
      <span className='text-base-content/60 basis-full text-xs'>{edition.attribution}</span>
    )}
  </li>
);

const noticeClassNames: Record<DownloadNotice['tone'], string> = {
  info: 'text-base-content/70',
  success: 'text-success',
  error: 'text-error',
};

export default function WorkDetailView({ workId, onBack }: WorkDetailViewProps) {
  const _ = useTranslation();
  const { appService } = useEnv();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<DownloadNotice | null>(null);

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

  const handleDownload = useCallback(
    async (edition: EditionView) => {
      if (!appService || downloadingId) return;
      setDownloadingId(edition.id);
      setNotice(null);
      try {
        const book = await downloadEdition({ appService, workId, edition });
        if (book) {
          setNotice({ tone: 'success', message: _('Added to your library') });
        }
      } catch (err) {
        if (isNotFoundError(err)) {
          const detail = await getWorkDetail(workId);
          setState({ status: 'ready', detail });
          setNotice({ tone: 'info', message: _('File list refreshed, try again') });
        } else {
          setNotice({ tone: 'error', message: err instanceof Error ? err.message : String(err) });
        }
      } finally {
        setDownloadingId(null);
      }
    },
    [appService, downloadingId, workId, _],
  );

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
          {notice && (
            <p role='status' className={`mb-2 text-sm ${noticeClassNames[notice.tone]}`}>
              {notice.message}
            </p>
          )}
          <ul>
            {state.detail.editions.map((edition) => (
              <EditionRow
                key={edition.id}
                edition={edition}
                busy={downloadingId !== null}
                onDownload={handleDownload}
                downloadLabel={_('Download')}
              />
            ))}
          </ul>
        </article>
      )}
    </div>
  );
}
