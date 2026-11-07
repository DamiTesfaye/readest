import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import { bookFeedParams, useBookTextId } from '@/services/margins/public/feedApi';
import { navigateToLibrary } from '@/utils/nav';

const OpenBookFeed = ({ textId }: { textId: string }) => {
  const _ = useTranslation();
  const router = useRouter();
  return (
    <button
      type='button'
      className='btn btn-ghost btn-sm'
      onClick={() => navigateToLibrary(router, bookFeedParams(textId))}
    >
      {_('Margins on this book')}
    </button>
  );
};

const MarginsOnBookButton = ({ hash }: { hash: string }) => {
  const textId = useBookTextId(hash);
  return textId ? <OpenBookFeed textId={textId} /> : null;
};

export default MarginsOnBookButton;
