import { useRouter, useSearchParams } from 'next/navigation';
import { useEnv } from '@/context/EnvContext';
import { useSettingsStore } from '@/store/settingsStore';
import {
  LibraryGroupByType,
  LibrarySecondarySortByType,
  LibrarySortByType,
} from '@/types/settings';
import { saveSysSettings } from '@/helpers/settings';
import { navigateToLibrary } from '@/utils/nav';

export const useLibrarySortControls = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { envConfig } = useEnv();
  const { settings } = useSettingsStore();

  const groupBy = settings.libraryGroupBy;
  const sortBy = settings.librarySortBy;
  const isAscending = settings.librarySortAscending;
  const sortByAuto = settings.librarySortByAuto ?? true;
  // Primary smart default: when auto is on, grouping by Series implies Series as
  // the primary sort. The stored value is left alone — that way turning auto off
  // later restores the user's previous explicit pick.
  const primaryEffective: LibrarySortByType =
    sortByAuto && groupBy === LibraryGroupByType.Series ? LibrarySortByType.Series : sortBy;
  const primaryIsImplicit = sortByAuto && primaryEffective !== sortBy;
  const sortBy2: LibrarySecondarySortByType = settings.librarySortBy2 ?? 'none';
  // Smart default: when grouping by Author and the user hasn't picked an explicit
  // secondary, Series is implied. Surface this in the menu so the highlighted row
  // matches the actual sort behavior.
  const secondaryEffective: LibrarySecondarySortByType =
    sortBy2 === 'none' && groupBy === LibraryGroupByType.Author
      ? LibrarySortByType.Series
      : sortBy2;
  const secondaryIsImplicit = sortBy2 === 'none' && secondaryEffective !== 'none';

  const handleSetGroupBy = async (value: LibraryGroupByType) => {
    await saveSysSettings(envConfig, 'libraryGroupBy', value);

    const params = new URLSearchParams(searchParams?.toString());
    if (value === LibraryGroupByType.Group) {
      params.delete('groupBy');
    } else {
      params.set('groupBy', value);
    }
    // Clear group navigation when changing groupBy mode
    params.delete('group');
    navigateToLibrary(router, `${params.toString()}`);
  };

  const handleSetSortBy = async (value: LibrarySortByType) => {
    await saveSysSettings(envConfig, 'librarySortBy', value);
    // Any explicit primary pick locks in the choice and disables the auto
    // smart-default so future groupBy changes don't override the user.
    await saveSysSettings(envConfig, 'librarySortByAuto', false);

    const params = new URLSearchParams(searchParams?.toString());
    params.set('sort', value);
    navigateToLibrary(router, `${params.toString()}`);
  };

  const handleSetSortAscending = async (value: boolean) => {
    await saveSysSettings(envConfig, 'librarySortAscending', value);

    const params = new URLSearchParams(searchParams?.toString());
    params.set('order', value ? 'asc' : 'desc');
    navigateToLibrary(router, `${params.toString()}`);
  };

  const handleSetSortBy2 = async (value: LibrarySecondarySortByType) => {
    await saveSysSettings(envConfig, 'librarySortBy2', value);

    const params = new URLSearchParams(searchParams?.toString());
    if (value === 'none') {
      params.delete('sort2');
    } else {
      params.set('sort2', value);
    }
    navigateToLibrary(router, `${params.toString()}`);
  };

  return {
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
  };
};
