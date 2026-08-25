'use client';

import clsx from 'clsx';
import Image from 'next/image';

import type { Shelf, WorkCard } from '@/services/ampleread';

interface ShelfRowProps {
  shelf: Shelf;
}

type ShelfLayoutKind = 'row';

// The spec's standing client rule: any layout value this client doesn't
// recognize yet renders as the default 'row' layout instead of failing.
const resolveShelfLayout = (layout: string): ShelfLayoutKind => {
  switch (layout) {
    case 'row':
      return 'row';
    default:
      return 'row';
  }
};

const shelfRowClassNames: Record<ShelfLayoutKind, string> = {
  row: 'flex gap-4 overflow-x-auto px-4 pb-2',
};

const formatAuthors = (authors: WorkCard['authors']): string =>
  authors.map((author) => author.name).join(', ');

const WorkCardTile = ({ item }: { item: WorkCard }) => (
  <div className='w-32 shrink-0'>
    <div className='card'>
      <figure className='bg-base-200 relative aspect-[28/41] overflow-hidden rounded shadow-md'>
        {item.cover ? (
          <Image src={item.cover} alt={item.title} fill className='object-cover' sizes='128px' />
        ) : (
          <div className='text-base-content/30 flex h-full w-full items-center justify-center'>
            <svg
              className='h-10 w-10'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
              aria-hidden='true'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253'
              />
            </svg>
          </div>
        )}
      </figure>
      <div className='py-2'>
        <h3 className='card-title line-clamp-1 text-sm'>{item.title}</h3>
        {item.authors.length > 0 && (
          <p className='text-base-content/70 line-clamp-1 text-xs'>{formatAuthors(item.authors)}</p>
        )}
      </div>
    </div>
  </div>
);

export default function ShelfRow({ shelf }: ShelfRowProps) {
  const layout = resolveShelfLayout(shelf.layout);

  return (
    <section className='explore-shelf mb-6'>
      <div className='mb-2 flex items-center justify-between px-4'>
        <h2 className='text-lg font-bold'>{shelf.title}</h2>
      </div>
      <div
        data-shelf-layout={layout}
        className={clsx('explore-shelf-row', shelfRowClassNames[layout])}
      >
        {shelf.items.map((item) => (
          <WorkCardTile key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
