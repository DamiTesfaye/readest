import clsx from 'clsx';
import React, { useRef } from 'react';

import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useTrafficLight } from '@/hooks/useTrafficLight';
import WindowButtons from '@/components/WindowButtons';
import Dropdown from '@/components/Dropdown';
import ImportMenu from './ImportMenu';

interface LibraryContentHeaderProps {
  showImportButton: boolean;
  isSelectMode: boolean;
  isSelectAll: boolean;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onImportBooksFromFiles: () => void;
  onImportBooksFromDirectory?: () => void;
  onImportBookFromUrl?: () => void;
  onOpenCatalogManager: () => void;
}

const LibraryContentHeader: React.FC<LibraryContentHeaderProps> = ({
  showImportButton,
  isSelectMode,
  isSelectAll,
  onSelectAll,
  onDeselectAll,
  onImportBooksFromFiles,
  onImportBooksFromDirectory,
  onImportBookFromUrl,
  onOpenCatalogManager,
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const headerRef = useRef<HTMLDivElement>(null);
  const { isTrafficLightVisible } = useTrafficLight(headerRef);
  const windowButtonVisible = appService?.hasWindowBar && !isTrafficLightVisible;

  return (
    <div
      ref={headerRef}
      className='titlebar hidden w-full items-center justify-between px-8 pb-2 pt-6 sm:flex'
    >
      <div className='flex items-center gap-3'>
        <h1 className='text-3xl font-semibold [font-family:Literata,serif]'>{_('Library')}</h1>
      </div>
      <div className='flex items-center gap-3'>
        {isSelectMode ? (
          <button
            type='button'
            onClick={isSelectAll ? onDeselectAll : onSelectAll}
            className='btn btn-ghost text-base-content/85 h-9 min-h-9 px-3'
          >
            <span className='truncate whitespace-nowrap font-sans text-sm font-normal'>
              {isSelectAll ? _('Deselect') : _('Select All')}
            </span>
          </button>
        ) : (
          showImportButton && (
            <Dropdown
              label={_('Import to Library')}
              className='exclude-title-bar-mousedown dropdown-bottom dropdown-end'
              buttonClassName={clsx(
                'bg-base-300 eink-bordered hover:bg-base-300/70 flex h-9 items-center rounded-lg px-4',
              )}
              toggleButton={
                <span className='whitespace-nowrap font-sans text-sm font-medium'>
                  {_('Import to Library')}
                </span>
              }
            >
              <ImportMenu
                onImportBooksFromFiles={onImportBooksFromFiles}
                onImportBooksFromDirectory={onImportBooksFromDirectory}
                onImportBookFromUrl={onImportBookFromUrl}
                onOpenCatalogManager={onOpenCatalogManager}
              />
            </Dropdown>
          )
        )}
        {appService?.hasWindowBar && (
          <WindowButtons
            headerRef={headerRef}
            showMinimize={windowButtonVisible}
            showMaximize={windowButtonVisible}
            showClose={windowButtonVisible}
          />
        )}
      </div>
    </div>
  );
};

export default LibraryContentHeader;
