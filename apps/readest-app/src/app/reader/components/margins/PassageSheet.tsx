import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { getSession } from '@/services/ampleread/auth/session';
import { type PostView, publicApi } from '@/services/margins/public/api';
import { SHEET_CLASS } from './HandleSheet';
import PostCard from './PostCard';

export interface PassageSheetProps {
  textId: string;
  section: number;
  sectionLen: number;
  start: number;
  end: number;
  onClose(): void;
  onViewInPlace(post: PostView | null): void;
}

const PassageSheet: React.FC<PassageSheetProps> = ({
  textId,
  section,
  sectionLen,
  start,
  end,
  onClose,
  onViewInPlace,
}) => {
  const _ = useTranslation();
  const [posts, setPosts] = useState<PostView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  const load = useCallback(
    async (from?: string) => {
      const page = await publicApi.passages(textId, section, sectionLen, start, end, from);
      setPosts((prev) => (from ? [...prev, ...page.posts] : page.posts));
      setCursor(page.nextCursor);
    },
    [textId, section, sectionLen, start, end],
  );
  const fail = () => console.error('Margins: passage feed failed');

  useEffect(() => {
    void getSession().then((s) => setSignedIn(!!s));
    load().catch(fail);
  }, [load]);

  const close = () => {
    onViewInPlace(null);
    onClose();
  };
  const title = _('{{count}} takes on this passage', { count: posts.length });

  return (
    <div role='dialog' aria-label={title} className={SHEET_CLASS}>
      <div className='flex items-center justify-between'>
        <p className='text-sm font-semibold'>{title}</p>
        <button type='button' className='btn btn-ghost btn-xs' onClick={close}>
          {_('Close')}
        </button>
      </div>
      <ul className='flex max-h-[60vh] flex-col gap-2 overflow-y-auto'>
        {posts.map((post) => (
          <li key={post.id}>
            <PostCard
              post={post}
              signedIn={signedIn}
              onViewInPlace={onViewInPlace}
              onMuted={(handle) => setPosts((all) => all.filter((p) => p.author.handle !== handle))}
            />
          </li>
        ))}
      </ul>
      {cursor && (
        <button
          type='button'
          className='btn btn-ghost btn-sm'
          onClick={() => void load(cursor).catch(fail)}
        >
          {_('Load more')}
        </button>
      )}
    </div>
  );
};

export default PassageSheet;
