import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEnv } from '@/context/EnvContext';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import {
  LibraryCoverFitType,
  LibraryViewModeType,
  LibraryGroupByType,
  LibrarySecondarySortByType,
  LibrarySortByType,
} from '@/types/settings';
import { saveSysSettings } from '@/helpers/settings';
import { navigateToLibrary } from '@/utils/nav';
import { useLibrarySortControls } from '../hooks/useLibrarySortControls';
import NumberInput from '@/components/settings/NumberInput';
import MenuItem from '@/components/MenuItem';
import Menu from '@/components/Menu';

interface ViewMenuProps {
  setIsDropdownOpen?: (isOpen: boolean) => void;
}

const ViewMenu: React.FC<ViewMenuProps> = ({ setIsDropdownOpen }) => {
  const _ = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { envConfig } = useEnv();
  const { settings } = useSettingsStore();

  const viewMode = settings.libraryViewMode;
  const coverFit = settings.libraryCoverFit;
  const autoColumns = settings.libraryAutoColumns;
  const columns = settings.libraryColumns;
  const {
    groupBy,
    sortBy,
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

  const viewOptions = [
    { label: _('List'), value: 'list' },
    { label: _('Grid'), value: 'grid' },
  ];

  const coverFitOptions = [
    { label: _('Crop'), value: 'crop' },
    { label: _('Fit'), value: 'fit' },
  ];

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
    { label: _('Progress Read'), value: LibrarySortByType.Progress },
  ];

  const sortBy2Options: { label: string; value: LibrarySecondarySortByType }[] = [
    { label: _('None'), value: 'none' },
    ...sortByOptions,
  ];

  const sortingOptions = [
    { label: _('Ascending'), value: true },
    { label: _('Descending'), value: false },
  ];

  const handleSetViewMode = async (value: LibraryViewModeType) => {
    await saveSysSettings(envConfig, 'libraryViewMode', value);

    const params = new URLSearchParams(searchParams?.toString());
    params.set('view', value);
    navigateToLibrary(router, `${params.toString()}`);
  };

  const handleToggleCropCovers = async (value: LibraryCoverFitType) => {
    await saveSysSettings(envConfig, 'libraryCoverFit', value);

    const params = new URLSearchParams(searchParams?.toString());
    params.set('cover', value);
    navigateToLibrary(router, `${params.toString()}`);
  };

  const handleToggleAutoColumns = async () => {
    const newValue = !settings.libraryAutoColumns;
    await saveSysSettings(envConfig, 'libraryAutoColumns', newValue);
  };

  const handleToggleRecentShelf = async () => {
    await saveSysSettings(
      envConfig,
      'libraryRecentShelfEnabled',
      !settings.libraryRecentShelfEnabled,
    );
  };

  const handleSetColumns = async (value: number) => {
    await saveSysSettings(envConfig, 'libraryColumns', value);
    await saveSysSettings(envConfig, 'libraryAutoColumns', false);
  };

  return (
    <Menu
      className='view-menu dropdown-content no-triangle z-20 mt-2 shadow-2xl'
      onCancel={() => setIsDropdownOpen?.(false)}
    >
      {/* View Mode */}
      {viewOptions.map((option) => (
        <MenuItem
          key={option.value}
          label={option.label}
          buttonClass='h-8'
          toggled={viewMode === option.value}
          onClick={() => handleSetViewMode(option.value as LibraryViewModeType)}
          transient
        />
      ))}

      {/* Columns */}
      <hr aria-hidden='true' className='border-base-200 my-1' />
      <MenuItem label={_('Columns')} buttonClass='h-8' labelClass='text-sm sm:text-xs' disabled />
      <MenuItem
        label={_('Auto')}
        buttonClass='h-10'
        toggled={autoColumns}
        disabled={viewMode === 'list'}
        siblings={
          <NumberInput
            className='!h-10 !p-0 !pe-1 !ps-0'
            inputClassName={`!p-0 text-center text-base sm:text-sm !w-10 !h-6 !pe-0 ${autoColumns ? 'opacity-50' : ''}`}
            label={''}
            value={columns}
            disabled={viewMode === 'list'}
            onChange={handleSetColumns}
            min={window.innerWidth < 640 ? 1 : window.innerWidth < 1024 ? 2 : 3}
            max={window.innerWidth < 640 ? 4 : window.innerWidth < 1024 ? 6 : 12}
          />
        }
        onClick={() => handleToggleAutoColumns()}
      />

      {/* Book Covers */}
      <hr aria-hidden='true' className='border-base-200 my-1' />
      <MenuItem
        label={_('Book Covers')}
        buttonClass='h-8'
        labelClass='text-sm sm:text-xs'
        disabled
      />
      {coverFitOptions.map((option) => (
        <MenuItem
          key={option.value}
          label={option.label}
          buttonClass='h-8'
          toggled={coverFit === option.value}
          onClick={() => handleToggleCropCovers(option.value as LibraryCoverFitType)}
          transient
        />
      ))}

      {/* Currently reading shelf */}
      <hr aria-hidden='true' className='border-base-200 my-1' />
      <MenuItem
        label={_('Show currently reading')}
        buttonClass='h-8'
        toggled={settings.libraryRecentShelfEnabled}
        onClick={handleToggleRecentShelf}
        transient
      />

      {/* Group By - Collapsible */}
      <hr aria-hidden='true' className='border-base-200 my-1' />
      <MenuItem label={_('Group by...')} detailsOpen={true} buttonClass='py-[4px]'>
        <ul className='ms-0 flex flex-col ps-0 before:hidden'>
          {groupByOptions.map((option) => (
            <MenuItem
              key={option.value}
              label={option.label}
              buttonClass='h-8'
              toggled={groupBy === option.value}
              onClick={() => handleSetGroupBy(option.value as LibraryGroupByType)}
              transient
            />
          ))}
        </ul>
      </MenuItem>

      {/* Sort By - Collapsible */}
      <hr aria-hidden='true' className='border-base-200 my-1' />
      <MenuItem label={_('Sort by...')} detailsOpen={false} buttonClass='py-[4px]'>
        <ul className='ms-0 flex flex-col ps-0 before:hidden'>
          {sortByOptions.map((option) => {
            const isImplicit = primaryIsImplicit && option.value === primaryEffective;
            const toggled = isImplicit || (!primaryIsImplicit && sortBy === option.value);
            return (
              <MenuItem
                key={option.value}
                label={isImplicit ? `${option.label} (${_('Auto')})` : option.label}
                buttonClass='h-8'
                toggled={toggled}
                onClick={() => handleSetSortBy(option.value as LibrarySortByType)}
                transient
              />
            );
          })}
          <hr aria-hidden='true' className='border-base-200 my-1' />
          {sortingOptions.map((option) => (
            <MenuItem
              key={option.value.toString()}
              label={option.label}
              buttonClass='h-8'
              toggled={isAscending === option.value}
              onClick={() => handleSetSortAscending(option.value)}
              transient
            />
          ))}
        </ul>
      </MenuItem>

      {/* Then by - secondary sort, collapsible */}
      <hr aria-hidden='true' className='border-base-200 my-1' />
      <MenuItem label={_('Then by...')} detailsOpen={false} buttonClass='py-[4px]'>
        <ul className='ms-0 flex flex-col ps-0 before:hidden'>
          {sortBy2Options.map((option) => {
            const isImplicit = secondaryIsImplicit && option.value === secondaryEffective;
            const isExplicit = sortBy2 === option.value;
            return (
              <MenuItem
                key={option.value}
                label={isImplicit ? `${option.label} (${_('Auto')})` : option.label}
                buttonClass='h-8'
                toggled={isExplicit || isImplicit}
                onClick={() => handleSetSortBy2(option.value)}
                transient
              />
            );
          })}
        </ul>
      </MenuItem>
    </Menu>
  );
};

export default ViewMenu;
