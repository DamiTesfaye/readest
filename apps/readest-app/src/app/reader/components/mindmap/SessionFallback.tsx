import React, { useState } from 'react';
import Spinner from '@/components/Spinner';
import { useTranslation } from '@/hooks/useTranslation';
import { useMindmapViewStore } from '@/store/mindmapViewStore';
import MapSwitcher from './MapSwitcher';
import { useDeleteMap, useExportRawMap, useMapList } from './useBookMaps';
import type { SessionState } from './useMindmapSession';

interface SessionFallbackProps {
  state: SessionState;
  bookKey: string;
  bookHash: string;
  mapId: string;
}

const SessionFallback: React.FC<SessionFallbackProps> = ({ state, bookKey, bookHash, mapId }) => {
  const _ = useTranslation();
  const { close, showMap, showSheet } = useMindmapViewStore();
  const maps = useMapList(bookHash);
  const deleteMap = useDeleteMap(bookKey, bookHash, mapId, maps, { localOnly: true });
  const title = maps.find((entry) => entry.mapId === mapId)?.title ?? '';
  const exportRaw = useExportRawMap(bookHash, mapId, title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (state.status === 'loading') {
    return (
      <div className='flex flex-1 items-center justify-center'>
        <Spinner loading />
      </div>
    );
  }
  return (
    <div
      data-testid='mm-error'
      className='flex flex-1 flex-col items-center justify-center gap-4 p-6 text-sm'
    >
      <MapSwitcher
        mapId={mapId}
        currentTitle={title}
        maps={maps}
        onSwitchMap={(next) => showMap(bookKey, next)}
        onNewMap={() => showSheet(bookKey)}
      />
      <div className='flex flex-col items-center gap-1 text-center'>
        <p>
          {state.status === 'already-open'
            ? _('This map is already open in another window')
            : _('This map could not be opened')}
        </p>
        {state.status === 'unreadable' && (
          <p className='text-base-content/70 text-[0.85em] leading-relaxed'>
            {_('If this map was synced, its copy returns after the app restarts.')}
          </p>
        )}
      </div>
      <div className='flex gap-2'>
        <button type='button' className='btn btn-ghost' onClick={close}>
          {_('Close')}
        </button>
        {state.status === 'unreadable' && (
          <button type='button' className='btn btn-ghost eink-bordered' onClick={exportRaw}>
            {_('Export raw file')}
          </button>
        )}
        {state.status === 'unreadable' && (
          <button
            type='button'
            className='btn btn-error'
            onClick={() => {
              if (!confirmDelete) {
                setConfirmDelete(true);
                return;
              }
              setConfirmDelete(false);
              void deleteMap();
            }}
          >
            {confirmDelete
              ? _('Tap again to delete from this device')
              : _('Delete from this device')}
          </button>
        )}
      </div>
    </div>
  );
};

export default SessionFallback;
