import { useTranslation } from '@/hooks/useTranslation';
import type { FeedSource } from '@/services/margins/public/feedApi';

export type FeedTab = 'for-you' | 'following' | 'book';

export interface FeedTabsProps {
  current: FeedSource['kind'];
  hasBook: boolean;
  onSelect(tab: FeedTab): void;
}

const FeedTabs = ({ current, hasBook, onSelect }: FeedTabsProps) => {
  const _ = useTranslation();
  const tabs: [FeedTab, string][] = [
    ['for-you', _('For You')],
    ['following', _('Following')],
    ...(hasBook ? [['book', _('This Book')] as [FeedTab, string]] : []),
  ];
  return (
    <div role='tablist' aria-label={_('Feeds')} className='tabs tabs-box justify-center'>
      {tabs.map(([tab, label]) => (
        <button
          key={tab}
          type='button'
          role='tab'
          aria-selected={current === tab}
          className={`tab ${current === tab ? 'tab-active' : ''}`}
          onClick={() => onSelect(tab)}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

export default FeedTabs;
