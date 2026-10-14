import { useEffect, useState } from 'react';
import { SHEET_CLASS } from '@/app/reader/components/margins/HandleSheet';
import { useTranslation } from '@/hooks/useTranslation';
import { getSession } from '@/services/ampleread/auth/session';
import { type PostView, publicApi } from '@/services/margins/public/api';
import { formatCitation } from '@/services/margins/public/citation';
import { socialApi, type UserProfile } from '@/services/margins/public/social';
import BlockSheet from './BlockSheet';
import FeedView from './FeedView';
import FollowButton, { askToSignIn } from './FollowButton';

const BUTTON = 'btn btn-ghost btn-xs';

const Cover = ({ post, onOpen }: { post: PostView; onOpen(): void }) => {
  const _ = useTranslation();
  const [src, setSrc] = useState<string | null>(post.coverAsset ? null : post.cardUrl);

  useEffect(() => {
    if (!post.coverAsset) return;
    let live = true;
    publicApi
      .postAssetUrl(post.id, post.coverAsset)
      .then((url) => live && setSrc(url ?? post.cardUrl))
      .catch(() => live && setSrc(post.cardUrl));
    return () => {
      live = false;
    };
  }, [post]);

  return (
    <button
      type='button'
      aria-label={formatCitation(post.citation, post.book)}
      className='bg-base-200 aspect-[9/16] overflow-hidden rounded-lg'
      onClick={onOpen}
    >
      {src && <img src={src} alt={_('Cover frame')} className='h-full w-full object-cover' />}
    </button>
  );
};

type Loaded = UserProfile | 'blocked' | null;

export const ProfileBody = ({ handle }: { handle: string }) => {
  const _ = useTranslation();
  const [profile, setProfile] = useState<Loaded | undefined>(undefined);
  const [posts, setPosts] = useState<PostView[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [more, setMore] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [feed, setFeed] = useState(false);

  useEffect(() => {
    let live = true;
    setProfile(undefined);
    setPosts([]);
    void getSession().then((s) => live && setSignedIn(!!s));
    Promise.all([
      socialApi.profile(handle),
      socialApi.profilePosts(handle).catch(() => ({ posts: [] as PostView[] })),
    ])
      .then(([p, page]) => {
        if (!live) return;
        setProfile(p);
        setPosts(page.posts);
      })
      .catch(() => console.error('Margins: profile read failed'));
    return () => {
      live = false;
    };
  }, [handle]);

  if (profile === undefined) return null;
  if (!profile || profile === 'blocked')
    return <p className='text-sm'>{_("This profile isn't available")}</p>;

  const startBlock = () => {
    setMore(false);
    if (!signedIn) return askToSignIn(_('Sign in to block or hide Margins'));
    setBlocking(true);
  };

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center gap-3'>
        <span
          aria-hidden='true'
          className='bg-base-300 flex h-12 w-12 items-center justify-center rounded-full text-lg font-semibold uppercase'
        >
          {[...(profile.displayName || profile.handle)][0]}
        </span>
        <span className='flex flex-1 flex-col leading-tight'>
          <span className='font-semibold'>{profile.displayName}</span>
          <span className='text-base-content/60 text-xs'>{`@${profile.handle}`}</span>
        </span>
        {!profile.mine && (
          <FollowButton handle={profile.handle} following={profile.followed} signedIn={signedIn} />
        )}
        {!profile.mine && (
          <button
            type='button'
            className={BUTTON}
            aria-expanded={more}
            onClick={() => setMore((m) => !m)}
          >
            {_('More')}
          </button>
        )}
      </div>
      {more && (
        <div className='bg-base-200 flex flex-col items-start gap-1 rounded-lg p-2'>
          <button type='button' className={BUTTON} onClick={startBlock}>
            {_('Block @{{handle}}', { handle: profile.handle })}
          </button>
        </div>
      )}
      <p className='text-base-content/70 text-xs'>
        {_('{{followers}} followers · {{following}} following', {
          followers: profile.followers,
          following: profile.following,
        })}
      </p>
      {posts.length === 0 ? (
        <p className='text-base-content/60 text-sm'>{_('No Margins yet')}</p>
      ) : (
        <div className='grid grid-cols-3 gap-2'>
          {posts.map((post) => (
            <Cover key={post.id} post={post} onOpen={() => setFeed(true)} />
          ))}
        </div>
      )}
      {blocking && (
        <BlockSheet
          handle={profile.handle}
          onBlocked={() => setProfile('blocked')}
          onClose={() => setBlocking(false)}
        />
      )}
      {feed && (
        <div
          role='dialog'
          aria-label={`@${profile.handle}`}
          className='bg-base-100 fixed inset-0 z-50 flex flex-col'
        >
          <div className='flex justify-end p-2'>
            <button type='button' className={BUTTON} onClick={() => setFeed(false)}>
              {_('Close')}
            </button>
          </div>
          <div className='min-h-0 flex-1'>
            <FeedView source={{ kind: 'profile', handle: profile.handle }} />
          </div>
        </div>
      )}
    </div>
  );
};

export interface ProfileSheetProps {
  handle: string;
  onClose(): void;
}

const ProfileSheet = ({ handle, onClose }: ProfileSheetProps) => {
  const _ = useTranslation();
  return (
    <div role='dialog' aria-label={`@${handle}`} className={SHEET_CLASS}>
      <div className='flex justify-end'>
        <button type='button' className={BUTTON} onClick={onClose}>
          {_('Close')}
        </button>
      </div>
      <ProfileBody handle={handle} />
    </div>
  );
};

export default ProfileSheet;
