import { useEffect, useState } from 'react';
import type { MarginCreator } from '@/services/margins/painter';
import type { LayerRow } from '@/services/margins/store';
import { eventDispatcher } from '@/utils/event';
import { isEnvelope, MarginArt, storedQuote } from './MarginCard';

export const MARGINS_PEEK_EVENT = 'margins-peek';

const POST_WIDTH = 224;
const POST_HEIGHT = 330;
const EDGE = 8;

export interface MarginPeekData {
  creator: MarginCreator;
  row: LayerRow;
}

interface Shown extends MarginPeekData {
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
        className='h-7 w-7 rounded-full object-cover'
        style={{ boxShadow: `0 0 0 2px ${creator.color}` }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className='flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white'
      style={{ background: creator.color }}
    >
      {creator.initial}
    </span>
  );
};

function MarginPeek({ bookKey }: { bookKey: string }) {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    const onPeek = (e: CustomEvent) => {
      const d = e.detail as { bookKey: string; peek: MarginPeekData | null; x: number; y: number };
      if (d.bookKey !== bookKey) return;
      setShown(d.peek ? { ...d.peek, x: d.x, y: d.y } : null);
    };
    eventDispatcher.on(MARGINS_PEEK_EVENT, onPeek);
    return () => eventDispatcher.off(MARGINS_PEEK_EVENT, onPeek);
  }, [bookKey]);

  if (!shown) return null;
  const { creator, row } = shown;
  const envelope = isEnvelope(row.payload) ? row.payload : null;
  return (
    <div
      role='tooltip'
      className='bg-base-100 text-base-content pointer-events-none fixed z-50 flex w-56 -rotate-1 flex-col gap-2 rounded-xl p-2 shadow-2xl'
      style={{
        left: `${Math.max(EDGE, Math.min(shown.x, window.innerWidth - POST_WIDTH - EDGE))}px`,
        top: `${shown.y + POST_HEIGHT > window.innerHeight ? Math.max(EDGE, shown.y - POST_HEIGHT) : shown.y}px`,
      }}
    >
      <div className='flex items-center gap-2 px-1'>
        <Avatar key={creator.avatarUrl ?? ''} creator={creator} />
        <span className='truncate text-sm font-medium'>{creator.name}</span>
      </div>
      {envelope && <MarginArt envelope={envelope} quote={storedQuote(row)} />}
    </div>
  );
}

export default MarginPeek;
