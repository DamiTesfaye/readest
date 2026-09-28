import React, { useState } from 'react';
import { MdArrowBack, MdFullscreen, MdMoreHoriz, MdViewSidebar } from 'react-icons/md';
import { useTranslation } from '@/hooks/useTranslation';
import { FREE_MAP_LIMIT } from '@/services/mindmap/limits';
import type { MindmapIndexEntry } from '@/services/mindmap/persist/mindmapIndex';
import type { MapMeta, MapStyle } from '@/services/mindmap/schema/types';
import type { UserPlan } from '@/types/quota';
import { intentLabels, spoilerLabels, styleLabels } from './mapLabels';

export const NEW_MAP_OPTION = '__new__';
const STYLES: MapStyle[] = ['sticker', 'paper', 'ink'];
const ICON_BUTTON = 'btn btn-ghost btn-circle h-8 min-h-8 w-8 p-0';

export interface TopBarProps {
  mapId: string;
  topInset?: number;
  meta: MapMeta;
  maps: MindmapIndexEntry[];
  plan: UserPlan;
  bookTitle: string;
  page: number;
  eink: boolean;
  readOnly: boolean;
  docked: boolean;
  canDock: boolean;
  wheelZooms: boolean;
  onBack: () => void;
  onSwitchMap: (mapId: string) => void;
  onNewMap: () => void;
  onRename: (title: string) => void;
  onStyle: (style: MapStyle) => void;
  onToggleDock: () => void;
  onToggleWheelZooms: () => void;
  onDelete: () => void;
  onExport?: () => void;
}

const TopBar: React.FC<TopBarProps> = (props) => {
  const _ = useTranslation();
  const { meta, maps, mapId } = props;
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const styles = styleLabels(_);
  const close = (): void => {
    setMenuOpen(false);
    setConfirmDelete(false);
  };
  return (
    <header
      data-testid='mm-top-bar'
      className='eink-bordered bg-base-100 text-base-content relative flex h-12 shrink-0 items-center gap-2 border-b border-base-300 px-2'
      style={props.topInset ? { marginTop: `${props.topInset}px` } : undefined}
    >
      <button
        type='button'
        className='btn btn-ghost btn-sm gap-1 rounded-full'
        onClick={props.onBack}
      >
        <MdArrowBack size={18} />
        <span className='hidden sm:inline'>{_('Back to page {{page}}', { page: props.page })}</span>
      </button>
      {renaming === null ? (
        <select
          aria-label={_('Mind map')}
          className='select select-ghost select-sm max-w-48 font-semibold'
          value={mapId}
          onChange={(event) =>
            event.target.value === NEW_MAP_OPTION
              ? props.onNewMap()
              : props.onSwitchMap(event.target.value)
          }
        >
          {maps.map((entry) => (
            <option key={entry.mapId} value={entry.mapId}>
              {entry.mapId === mapId
                ? meta.title || _('Untitled map')
                : entry.title || _('Untitled map')}
            </option>
          ))}
          <option value={NEW_MAP_OPTION}>{_('New map…')}</option>
        </select>
      ) : (
        <input
          aria-label={_('Map title')}
          className='input input-bordered input-sm eink-bordered max-w-48'
          value={renaming}
          autoFocus
          onChange={(event) => setRenaming(event.target.value)}
          onBlur={() => setRenaming(null)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              props.onRename(renaming.trim() || meta.title);
              setRenaming(null);
            } else if (event.key === 'Escape') {
              setRenaming(null);
            }
          }}
        />
      )}
      {props.plan === 'free' && (
        <span data-testid='mm-map-count' className='text-xs'>
          {`${maps.length}/${FREE_MAP_LIMIT}`}
        </span>
      )}
      <span className='hidden min-w-0 flex-1 truncate text-center text-xs md:block'>
        {props.bookTitle}
      </span>
      <span className='bg-base-200 hidden rounded-full px-2 py-0.5 text-xs lg:inline'>
        {_('{{intent}} · {{spoiler}}', {
          intent: intentLabels(_)[meta.intent],
          spoiler: spoilerLabels(_)[meta.spoiler],
        })}
      </span>
      <select
        aria-label={_('Map style')}
        className='select select-ghost select-sm ms-auto md:ms-0'
        value={props.eink ? 'ink' : meta.style}
        disabled={props.eink || props.readOnly}
        title={props.eink ? _('Ink & margin is used on e-ink screens') : undefined}
        onChange={(event) => props.onStyle(event.target.value as MapStyle)}
      >
        {STYLES.map((style) => (
          <option key={style} value={style}>
            {styles[style]}
          </option>
        ))}
      </select>
      {props.canDock && (
        <button
          type='button'
          className={ICON_BUTTON}
          aria-label={props.docked ? _('Full screen') : _('Dock beside book')}
          title={props.docked ? _('Full screen') : _('Dock beside book')}
          onClick={props.onToggleDock}
        >
          {props.docked ? <MdFullscreen size={18} /> : <MdViewSidebar size={18} />}
        </button>
      )}
      <button
        type='button'
        className={ICON_BUTTON}
        aria-label={_('Map options')}
        aria-haspopup='menu'
        aria-expanded={menuOpen}
        onClick={() => (menuOpen ? close() : setMenuOpen(true))}
      >
        <MdMoreHoriz size={18} />
      </button>
      {menuOpen && (
        <div
          role='menu'
          aria-label={_('Map options')}
          className='eink-bordered bg-base-100 absolute end-2 top-12 z-10 flex min-w-52 flex-col rounded-lg p-1 text-sm shadow-lg'
        >
          {!props.readOnly && (
            <button
              type='button'
              role='menuitem'
              className='hover:bg-base-200 rounded-md px-3 py-2 text-start'
              onClick={() => {
                setRenaming(meta.title);
                close();
              }}
            >
              {_('Rename')}
            </button>
          )}
          {props.onExport && (
            <button
              type='button'
              role='menuitem'
              className='hover:bg-base-200 rounded-md px-3 py-2 text-start'
              onClick={() => {
                props.onExport?.();
                close();
              }}
            >
              {_('Export JSON Canvas')}
            </button>
          )}
          <button
            type='button'
            role='menuitemcheckbox'
            aria-checked={props.wheelZooms}
            className='hover:bg-base-200 rounded-md px-3 py-2 text-start'
            onClick={() => {
              props.onToggleWheelZooms();
              close();
            }}
          >
            {_('Scroll wheel zooms')}
          </button>
          <button
            type='button'
            role='menuitem'
            className='hover:bg-base-200 text-error rounded-md px-3 py-2 text-start'
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              close();
              props.onDelete();
            }}
          >
            {confirmDelete ? _('Tap again to delete this map') : _('Delete map')}
          </button>
        </div>
      )}
    </header>
  );
};

export default TopBar;
