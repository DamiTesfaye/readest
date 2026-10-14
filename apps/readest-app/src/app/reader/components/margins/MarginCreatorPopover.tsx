import { useEffect, useState } from 'react';
import type { MarginCreator } from '@/services/margins/painter';
import { eventDispatcher } from '@/utils/event';

export const MARGINS_CREATOR_EVENT = 'margins-creator';

interface Shown {
  creator: MarginCreator;
  x: number;
  y: number;
}

const Avatar = ({ creator }: { creator: MarginCreator }) => {
  const [failed, setFailed] = useState(false);
  if (creator.avatarUrl && !failed) {
    return (
      <img
        src={creator.avatarUrl}
        alt=''
        className='h-8 w-8 rounded-full object-cover'
        style={{ boxShadow: `0 0 0 2px ${creator.color}` }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className='flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white'
      style={{ background: creator.color }}
    >
      {creator.initial}
    </span>
  );
};

function MarginCreatorPopover({ bookKey }: { bookKey: string }) {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    const onCreator = (e: CustomEvent) => {
      const d = e.detail as {
        bookKey: string;
        creator: MarginCreator | null;
        x: number;
        y: number;
      };
      if (d.bookKey !== bookKey) return;
      setShown(d.creator ? { creator: d.creator, x: d.x, y: d.y } : null);
    };
    eventDispatcher.on(MARGINS_CREATOR_EVENT, onCreator);
    return () => eventDispatcher.off(MARGINS_CREATOR_EVENT, onCreator);
  }, [bookKey]);

  if (!shown) return null;
  return (
    <div
      role='tooltip'
      className='bg-base-100 text-base-content pointer-events-none fixed z-50 flex items-center gap-2 rounded-xl px-3 py-2 text-sm shadow-lg'
      style={{ left: `${shown.x}px`, top: `${shown.y}px` }}
    >
      <Avatar key={shown.creator.avatarUrl ?? ''} creator={shown.creator} />
      <span className='max-w-48 truncate font-medium'>{shown.creator.name}</span>
    </div>
  );
}

export default MarginCreatorPopover;
