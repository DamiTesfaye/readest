import clsx from 'clsx';
import type { ReadingStatus } from '@/types/book';
import { useThemeStore } from '@/store/themeStore';

interface StatusBadgeProps {
  status?: ReadingStatus;
  children: React.ReactNode;
  className?: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, children, className }) => {
  const { isDarkMode } = useThemeStore();

  if (status === 'finished') {
    return (
      <span
        className={clsx('status-badge-finished inline-flex h-4 items-center', className)}
        role='status'
      >
        <img
          src='/images/homepage/finished-tick.svg'
          alt=''
          aria-hidden
          className={clsx('h-4 w-4 object-contain', isDarkMode && 'invert')}
        />
        <span className='sr-only'>{children}</span>
      </span>
    );
  }

  if (status !== 'unread' && status !== 'abandoned') return null;

  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center',
        'rounded-[1px] px-0.5',
        'text-[8px] font-bold uppercase leading-none tracking-wider',
        'h-3.5',
        status === 'unread' && 'status-badge-unread',
        status === 'abandoned' && 'status-badge-abandoned',
        // unread: pastel yellow/amber
        status === 'unread' && 'bg-amber-100 dark:bg-amber-900/80',
        status === 'unread' && 'border border-amber-300/50 dark:border-amber-700/50',
        status === 'unread' && 'text-amber-700 dark:text-amber-300',
        // abandoned / on hold: slate
        status === 'abandoned' && 'bg-slate-100 dark:bg-slate-800/80',
        status === 'abandoned' && 'border border-slate-300/50 dark:border-slate-600/50',
        status === 'abandoned' && 'text-slate-700 dark:text-slate-300',
        className,
      )}
      role='status'
    >
      <span className='relative top-[0.5px]'>{children}</span>
    </span>
  );
};

export default StatusBadge;
