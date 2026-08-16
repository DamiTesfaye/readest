import clsx from 'clsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FaSearch, FaUser } from 'react-icons/fa';
import { LuChevronsUpDown } from 'react-icons/lu';
import { PiCaretRightBold } from 'react-icons/pi';

import { useEnv } from '@/context/EnvContext';
import { useAuth } from '@/context/AuthContext';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useAppRouter } from '@/hooks/useAppRouter';
import { useTrafficLight } from '@/hooks/useTrafficLight';
import { navigateToLibrary, navigateToProfile } from '@/utils/nav';
import { getHomepageIconSrc, getSearchShortcutBadgeSrc } from '@/utils/toolbarIcons';
import { getUserProfilePlan } from '@/utils/access';
import { ensureLibraryStatusFilter, LibraryStatusFilter } from '../utils/libraryUtils';
import { eventDispatcher } from '@/utils/event';
import { debounce } from '@/utils/debounce';
import UserAvatar from '@/components/UserAvatar';
import Dropdown from '@/components/Dropdown';
import SettingsMenu from './SettingsMenu';

const AVATAR_CORAL = '#E8846B';

const TAG_COLORS = [
  { label: 'Red', color: '#C24545' },
  { label: 'Orange', color: '#E8846B' },
  { label: 'Green', color: '#96CE7E' },
  { label: 'Blue', color: '#8FA9F0' },
  { label: 'Purple', color: '#B9A8EF' },
  { label: 'Yellow', color: '#F2D34E' },
];

const PLAN_LABELS = {
  free: 'Free',
  plus: 'Plus',
  pro: 'Pro',
  purchase: 'Lifetime',
} as const;

interface LibrarySidebarProps {
  onPullLibrary: () => void;
  onOpenCatalogManager: () => void;
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

const LibrarySidebar: React.FC<LibrarySidebarProps> = ({ onPullLibrary, onOpenCatalogManager }) => {
  const _ = useTranslation();
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const { appService } = useEnv();
  const { user, token } = useAuth();
  const { isDarkMode } = useThemeStore();
  const { isTrafficLightVisible } = useTrafficLight();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState(searchParams?.get('q') ?? '');
  const [isTagsOpen, setIsTagsOpen] = useState(false);

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
            icon='collections'
            label={_('Collections')}
            isDarkMode={isDarkMode}
            onClick={toastComingSoon}
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
        <div className='flex flex-col gap-1'>
          <button
            type='button'
            aria-expanded={isTagsOpen}
            onClick={() => setIsTagsOpen(!isTagsOpen)}
            className='group flex w-full items-center justify-between rounded-lg px-2 text-start'
          >
            <span className='text-base-content/50 [font-family:"Avenir_Next_LT_Pro"] text-xs'>
              {_('Tags')}
            </span>
            <PiCaretRightBold
              aria-hidden
              className={clsx(
                'text-base-content/70 h-3 w-3 transition-all duration-200',
                isTagsOpen ? 'rotate-90 opacity-100' : 'opacity-0 group-hover:opacity-100',
              )}
            />
          </button>
          {isTagsOpen &&
            TAG_COLORS.map((tag) => (
              <button
                key={tag.label}
                type='button'
                onClick={toastComingSoon}
                className={clsx(
                  'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start',
                  'hover:bg-base-300/70 [font-family:"Avenir_Next_LT_Pro"] text-sm',
                  'text-base-content/85',
                )}
              >
                <span className='flex w-6 justify-center'>
                  <span
                    aria-hidden
                    className='h-3.5 w-3.5 rounded-full'
                    style={{ backgroundColor: tag.color }}
                  />
                </span>
                <span className='truncate'>{_(tag.label)}</span>
              </button>
            ))}
        </div>
      </nav>
      <div className='border-base-300 eink-bordered border-t p-3'>
        {user ? (
          <div className='flex items-center gap-2'>
            <Dropdown
              label={_('Account Menu')}
              className='dropdown-top'
              containerClassName='min-w-0 flex-1'
              buttonClassName='hover:bg-base-300/70 flex w-full min-w-0 items-center gap-2 rounded-lg p-1 text-start'
              toggleButton={
                <>
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
                </>
              }
            >
              <SettingsMenu onPullLibrary={onPullLibrary} />
            </Dropdown>
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
          <Dropdown
            label={_('Sign into your account')}
            className='dropdown-top'
            containerClassName='w-full'
            buttonClassName='hover:bg-base-300/70 -m-1 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded-lg p-1 text-start'
            toggleButton={
              <>
                <div
                  className='h-8 w-8 shrink-0 rounded-full'
                  style={{ backgroundColor: AVATAR_CORAL }}
                />
                <span className='truncate [font-family:"Avenir_Next_LT_Pro"] text-sm'>
                  {_('Sign into your account')}
                </span>
              </>
            }
          >
            <SettingsMenu onPullLibrary={onPullLibrary} />
          </Dropdown>
        )}
      </div>
    </aside>
  );
};

export default LibrarySidebar;
