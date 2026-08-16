import clsx from 'clsx';
import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  LibraryGroupByType,
  LibrarySecondarySortByType,
  LibrarySortByType,
} from '@/types/settings';
import { useLibrarySortControls } from '../hooks/useLibrarySortControls';
import Menu from '@/components/Menu';

interface SortFilterMenuProps {
  setIsDropdownOpen?: (isOpen: boolean) => void;
}

interface PillProps {
  label: string;
  selected: boolean;
  onClick: () => void;
}

const Pill: React.FC<PillProps> = ({ label, selected, onClick }) => (
  <button
    type='button'
    aria-pressed={selected}
    onClick={onClick}
    className={clsx(
      'eink-bordered whitespace-nowrap rounded-full px-3 py-1.5 font-sans text-xs',
      selected
        ? 'bg-base-content/85 text-base-100'
        : 'bg-base-200 hover:bg-base-300 text-base-content/85',
    )}
  >
    {label}
  </button>
);

const PillSection: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div role='group' aria-label={label} className='flex flex-col gap-2.5'>
    <span className='text-base-content/85 font-sans text-xs font-semibold'>{label}</span>
    {children}
  </div>
);

const SortFilterMenu: React.FC<SortFilterMenuProps> = ({ setIsDropdownOpen }) => {
  const _ = useTranslation();
  const {
    groupBy,
    isAscending,
    sortBy2,
    primaryEffective,
    primaryIsImplicit,
    secondaryEffective,
    secondaryIsImplicit,
    handleSetGroupBy,
    handleSetSortBy,
    handleSetSortAscending,
    handleSetSortBy2,
  } = useLibrarySortControls();

  const groupByOptions = [
    { label: _('Authors'), value: LibraryGroupByType.Author },
    { label: _('Books'), value: LibraryGroupByType.None },
    { label: _('Groups'), value: LibraryGroupByType.Group },
    { label: _('Series'), value: LibraryGroupByType.Series },
  ];

  const sortByOptions = [
    { label: _('Title'), value: LibrarySortByType.Title },
    { label: _('Author'), value: LibrarySortByType.Author },
    { label: _('Format'), value: LibrarySortByType.Format },
    { label: _('Series'), value: LibrarySortByType.Series },
    { label: _('Date Read'), value: LibrarySortByType.Updated },
    { label: _('Date Added'), value: LibrarySortByType.Created },
    { label: _('Date Published'), value: LibrarySortByType.Published },
    { label: _('Reading Progress'), value: LibrarySortByType.Progress },
  ];

  const sortingOptions = [
    { label: _('Ascending'), value: true },
    { label: _('Descending'), value: false },
  ];

  const handleSecondaryPick = (value: LibrarySortByType) => {
    const next: LibrarySecondarySortByType = sortBy2 === value ? 'none' : value;
    handleSetSortBy2(next);
  };

  return (
    <Menu
      className={clsx(
        'sort-filter-menu dropdown-content no-triangle z-20 mt-2 shadow-2xl',
        'bg-base-100 eink-bordered w-72 rounded-xl p-4',
      )}
      onCancel={() => setIsDropdownOpen?.(false)}
    >
      <div className='flex flex-col gap-4'>
        <PillSection label={_('Group by')}>
          <div className='flex flex-wrap gap-2'>
            {groupByOptions.map((option) => (
              <Pill
                key={option.value}
                label={option.label}
                selected={groupBy === option.value}
                onClick={() => handleSetGroupBy(option.value)}
              />
            ))}
          </div>
        </PillSection>
        <PillSection label={_('Sort by')}>
          <div className='flex flex-wrap gap-2'>
            {sortByOptions.map((option) => {
              const isImplicit = primaryIsImplicit && option.value === primaryEffective;
              const selected =
                isImplicit || (!primaryIsImplicit && primaryEffective === option.value);
              return (
                <Pill
                  key={option.value}
                  label={isImplicit ? `${option.label} (${_('Auto')})` : option.label}
                  selected={selected}
                  onClick={() => handleSetSortBy(option.value)}
                />
              );
            })}
          </div>
          <div className='flex flex-wrap gap-2'>
            {sortingOptions.map((option) => (
              <Pill
                key={option.value.toString()}
                label={option.label}
                selected={isAscending === option.value}
                onClick={() => handleSetSortAscending(option.value)}
              />
            ))}
          </div>
        </PillSection>
        <PillSection label={_('Then arrange by')}>
          <div className='flex flex-wrap gap-2'>
            {sortByOptions.map((option) => {
              const isImplicit = secondaryIsImplicit && option.value === secondaryEffective;
              return (
                <Pill
                  key={option.value}
                  label={isImplicit ? `${option.label} (${_('Auto')})` : option.label}
                  selected={isImplicit || sortBy2 === option.value}
                  onClick={() => handleSecondaryPick(option.value)}
                />
              );
            })}
          </div>
        </PillSection>
      </div>
    </Menu>
  );
};

export default SortFilterMenu;
