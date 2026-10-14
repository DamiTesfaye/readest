import type { PostAuthor } from '@/services/margins/public/api';

export interface CreatorChipProps {
  author: PostAuthor;
}

const CreatorChip = ({ author }: CreatorChipProps) => (
  <div className='flex items-center gap-2'>
    <span
      aria-hidden='true'
      className='bg-base-300 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold uppercase'
    >
      {[...(author.displayName || author.handle)][0]}
    </span>
    <span className='flex flex-col leading-tight'>
      <span className='text-sm font-semibold'>{author.displayName}</span>
      <span className='text-base-content/60 text-xs'>{`@${author.handle}`}</span>
    </span>
  </div>
);

export default CreatorChip;
