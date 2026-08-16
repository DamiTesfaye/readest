import clsx from 'clsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FaSearch, FaUser } from 'react-icons/fa';
import { PiDotsThreeCircle, PiSelectionAll, PiSelectionAllFill } from 'react-icons/pi';
import { MdOutlineMenu } from 'react-icons/md';
import { LuChevronsUpDown } from 'react-icons/lu';

import { useEnv } from '@/context/EnvContext';
import { useAuth } from '@/context/AuthContext';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useAppRouter } from '@/hooks/useAppRouter';
import { useTrafficLight } from '@/hooks/useTrafficLight';
import { navigateToLibrary, navigateToLogin, navigateToProfile } from '@/utils/nav';
import { getHomepageIconSrc, getSearchShortcutBadgeSrc } from '@/utils/toolbarIcons';
import { getUserProfilePlan } from '@/utils/access';
import { ensureLibraryStatusFilter, LibraryStatusFilter } from '../utils/libraryUtils';
import { eventDispatcher } from '@/utils/event';
import { debounce } from '@/utils/debounce';
import UserAvatar from '@/components/UserAvatar';
import Dropdown from '@/components/Dropdown';
import SettingsMenu from './SettingsMenu';
import ViewMenu from './ViewMenu';

const AVATAR_CORAL = '#E8846B';

const PLAN_LABELS = {
  free: 'Free',
  plus: 'Plus',
  pro: 'Pro',
  purchase: 'Lifetime',
} as const;

interface LibrarySidebarProps {
  onPullLibrary: () => void;
  onOpenCatalogManager: () => void;
  isSelectMode: boolean;
  onToggleSelectMode: () => void;
}

interface SidebarNavItemProps {
  icon: string;
  label: string;
  active?: boolean;
  isDarkMode: boolean;
  onClick: () => void;
}

const SidebarNavItem: React.FC<SidebarNavItemProps> = ({
  icon,
  label,
  active = false,
  isDarkMode,
  onClick,
}) => (
  <button
    type='button'
    aria-current={active ? 'page' : undefined}
    onClick={onClick}
    className={clsx(
      'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start',
      'hover:bg-base-300/70 [font-family:"Avenir_Next_LT_Pro"] text-sm',
      active ? 'bg-base-300/70 text-base-content' : 'text-base-content/85',
    )}
  >
    <img
      src={getHomepageIconSrc(icon, isDarkMode, active)}
      alt=''
      aria-hidden
      className='h-4 w-6 object-contain'
    />
    <span className='truncate'>{label}</span>
  </button>
);

const LibrarySidebar: React.FC<LibrarySidebarProps> = ({
  onPullLibrary,
  onOpenCatalogManager,
  isSelectMode,
  onToggleSelectMode,
}) => {
  const _ = useTranslation();
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const { appService } = useEnv();
  const { user, token } = useAuth();
  const { isDarkMode } = useThemeStore();
  const { isTrafficLightVisible } = useTrafficLight();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams?.get('q') ?? '');

  const statusFilter = ensureLibraryStatusFilter(searchParams?.get('status'));

  const navigateWithParams = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams?.toString());
      mutate(params);
      navigateToLibrary(router, params.toString());
    },
    [router, searchParams],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedUpdateQueryParam = useCallback(
    debounce((value: string) => {
      navigateWithParams((params) => {
        if (value) {
          params.set('q', value);
        } else {
          params.delete('q');
        }
      });
    }, 500),
    [navigateWithParams],
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    debouncedUpdateQueryParam(e.target.value);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelectStatus = (status: LibraryStatusFilter) => {
    navigateWithParams((params) => {
      if (status === 'all') {
        params.delete('status');
      } else {
        params.set('status', status);
      }
      params.delete('group');
    });
  };

  const toastComingSoon = () => {
    eventDispatcher.dispatch('toast', {
      message: _('Coming soon'),
      type: 'info',
      timeout: 2000,
    });
  };

  const plan = token ? getUserProfilePlan(token) : 'free';
  const userFullName = user?.user_metadata?.['full_name'] || user?.email || '';
  const avatarUrl = user?.user_metadata?.['picture'] || user?.user_metadata?.['avatar_url'] || '';

  return (
    <aside
      aria-label={_('Library Sidebar')}
      className={clsx(
        'bg-base-200 border-base-300 eink-bordered flex h-full w-60 shrink-0 flex-col border-e',
        isTrafficLightVisible ? 'pt-10' : 'pt-3',
      )}
    >
      <div className='px-3 pt-2'>
        <div className='relative flex h-8 items-center'>
          <span className='text-base-content/50 absolute ps-2.5'>
            <FaSearch className='h-3.5 w-3.5' />
          </span>
          <input
            ref={searchInputRef}
            type='search'
            value={searchQuery}
            placeholder={_('Search')}
            onChange={handleSearchChange}
            spellCheck='false'
            className={clsx(
              'search-input input eink-bordered h-8 w-full rounded-lg pe-10 ps-8',
              'bg-base-300/45 border-0',
              '[font-family:"Avenir_Next_LT_Pro"] text-sm font-light',
              'placeholder:text-base-content/50 truncate',
              'focus:outline-none focus:ring-0',
            )}
          />
          <img
            src={getSearchShortcutBadgeSrc(appService?.osPlatform, isDarkMode)}
            alt='⌘K'
            className='absolute end-2.5 h-3 w-auto'
          />
        </div>
      </div>
      <nav className='flex flex-1 flex-col gap-5 overflow-y-auto px-3 pt-5'>
        <div className='flex flex-col gap-1'>
          <span className='text-base-content/50 px-2 [font-family:"Avenir_Next_LT_Pro"] text-xs'>
            {_('Library')}
          </span>
          <SidebarNavItem
            icon='library'
            label={_('All')}
            active={statusFilter === 'all'}
            isDarkMode={isDarkMode}
            onClick={() => handleSelectStatus('all')}
          />
          <SidebarNavItem
            icon='currently-reading'
            label={_('Currently Reading')}
            active={statusFilter === 'reading'}
            isDarkMode={isDarkMode}
            onClick={() => handleSelectStatus('reading')}
          />
          <SidebarNavItem
            icon='finished-reading'
            label={_('Finished')}
            active={statusFilter === 'finished'}
            isDarkMode={isDarkMode}
            onClick={() => handleSelectStatus('finished')}
          />
          <SidebarNavItem
            icon='shared'
            label={_('Shared')}
            isDarkMode={isDarkMode}
            onClick={toastComingSoon}
          />
        </div>
        <div className='flex flex-col gap-1'>
          <span className='text-base-content/50 px-2 [font-family:"Avenir_Next_LT_Pro"] text-xs'>
            {_('Discover')}
          </span>
          <SidebarNavItem
            icon='catalogs'
            label={_('Catalogs')}
            isDarkMode={isDarkMode}
            onClick={onOpenCatalogManager}
          />
          <SidebarNavItem
            icon='rss'
            label={_('RSS Feeds')}
            isDarkMode={isDarkMode}
            onClick={toastComingSoon}
          />
        </div>
      </nav>
      <div className='text-base-content/60 flex items-center justify-around px-3 py-1.5'>
        <Dropdown
          label={_('View Menu')}
          className='dropdown-top dropdown-center'
          buttonClassName='btn btn-ghost h-8 min-h-8 w-8 p-0'
          toggleButton={<PiDotsThreeCircle role='none' className='h-[18px] w-[18px]' />}
        >
          <ViewMenu />
        </Dropdown>
        <button
          type='button'
          onClick={onToggleSelectMode}
          aria-label={_('Select Books')}
          title={_('Select Books')}
          className='btn btn-ghost h-8 min-h-8 w-8 p-0'
        >
          {isSelectMode ? (
            <PiSelectionAllFill role='none' className='h-[18px] w-[18px]' />
          ) : (
            <PiSelectionAll role='none' className='h-[18px] w-[18px]' />
          )}
        </button>
        <Dropdown
          label={_('Settings Menu')}
          className='dropdown-top dropdown-center'
          buttonClassName='btn btn-ghost h-8 min-h-8 w-8 p-0'
          toggleButton={<MdOutlineMenu role='none' className='h-[18px] w-[18px]' />}
        >
          <SettingsMenu onPullLibrary={onPullLibrary} />
        </Dropdown>
      </div>
      <div className='border-base-300 eink-bordered border-t p-3'>
        {user ? (
          <div className='flex items-center gap-2'>
            <button
              type='button'
              onClick={() => navigateToProfile(router)}
              className='flex min-w-0 flex-1 items-center gap-2 text-start'
              aria-label={_('Account')}
            >
              <div
                className='flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full'
                style={{ backgroundColor: AVATAR_CORAL }}
              >
                {avatarUrl && <UserAvatar url={avatarUrl} size={32} DefaultIcon={FaUser} />}
              </div>
              <span className='flex min-w-0 flex-col'>
                <span className='truncate [font-family:"Avenir_Next_LT_Pro"] text-sm'>
                  {userFullName}
                </span>
                <span className='text-base-content/60 truncate [font-family:"Avenir_Next_LT_Pro"] text-xs'>
                  {_(PLAN_LABELS[plan])}
                </span>
              </span>
            </button>
            {plan === 'free' && (
              <button
                type='button'
                onClick={() => navigateToProfile(router)}
                className={clsx(
                  'border-base-300 eink-bordered rounded-full border px-3 py-1',
                  'hover:bg-base-300/70 [font-family:"Avenir_Next_LT_Pro"] text-xs font-medium',
                )}
              >
                {_('Upgrade')}
              </button>
            )}
            <LuChevronsUpDown aria-hidden className='text-base-content/50 h-4 w-4 shrink-0' />
          </div>
        ) : (
          <button
            type='button'
            onClick={() => navigateToLogin(router)}
            className='hover:bg-base-300/70 -m-1 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded-lg p-1 text-start'
          >
            <div
              className='h-8 w-8 shrink-0 rounded-full'
              style={{ backgroundColor: AVATAR_CORAL }}
            />
            <span className='truncate [font-family:"Avenir_Next_LT_Pro"] text-sm'>
              {_('Sign into your account')}
            </span>
          </button>
        )}
      </div>
    </aside>
  );
};

export default LibrarySidebar;
