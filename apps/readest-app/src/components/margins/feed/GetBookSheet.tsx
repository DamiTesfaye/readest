import { useEffect, useState } from 'react';
import WorkDetailView from '@/app/explore/components/WorkDetailView';
import { SHEET_CLASS } from '@/app/reader/components/margins/HandleSheet';
import { useOpenTarget } from '@/app/reader/components/margins/PostCard';
import { useTranslation } from '@/hooks/useTranslation';
import type { PostView } from '@/services/margins/public/api';
import type { OpenTarget } from '@/services/margins/public/openPost';
import { openExternalUrl } from '@/utils/open';

export interface GetBookSheetProps {
  post: PostView;
  onClose(): void;
  onTap(): void;
}

const ACTION = 'btn btn-primary btn-sm self-start';

const GetBookSheet = ({ post, onClose, onTap }: GetBookSheetProps) => {
  const _ = useTranslation();
  const { go, resolve, getBook } = useOpenTarget(post);
  const [target, setTarget] = useState<OpenTarget | null>(null);
  const fail = () => console.error('Margins: get this book failed');

  useEffect(() => {
    let live = true;
    resolve()
      .then((found) => live && setTarget(found))
      .catch(fail);
    return () => {
      live = false;
    };
  }, [post.id]);

  const tap = (run: () => unknown) => () => {
    onTap();
    void Promise.resolve().then(run).catch(fail);
  };

  const { workId, findUrl } = post.book;

  return (
    <div role='dialog' aria-label={_('Get this book')} className={SHEET_CLASS}>
      <div className='flex justify-end'>
        <button type='button' className='btn btn-ghost btn-xs' onClick={onClose}>
          {_('Close')}
        </button>
      </div>
      {target?.kind === 'library' && (
        <button type='button' className={ACTION} onClick={tap(() => go(target.bookHash))}>
          {_('Open at this page')}
        </button>
      )}
      {target?.kind === 'download' && (
        <button type='button' className={ACTION} onClick={tap(() => getBook(target.workId))}>
          {_('Get this book (free)')}
        </button>
      )}
      {target?.kind === 'yourCopy' && workId && <WorkDetailView workId={workId} onBack={onClose} />}
      {target?.kind === 'yourCopy' && !workId && findUrl && (
        <button type='button' className={ACTION} onClick={tap(() => openExternalUrl(findUrl))}>
          {_('Find this book')}
        </button>
      )}
      {target?.kind === 'yourCopy' && !workId && (
        <p className='text-base-content/70 text-xs'>
          {_('Open this book from your library to see this Margin in place.')}
        </p>
      )}
    </div>
  );
};

export default GetBookSheet;
