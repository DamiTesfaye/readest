import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import type { MindmapIndexEntry } from '@/services/mindmap/persist/mindmapIndex';

export const NEW_MAP_OPTION = '__new__';

interface MapSwitcherProps {
  mapId: string;
  currentTitle: string;
  maps: MindmapIndexEntry[];
  onSwitchMap: (mapId: string) => void;
  onNewMap: () => void;
}

const MapSwitcher: React.FC<MapSwitcherProps> = ({
  mapId,
  currentTitle,
  maps,
  onSwitchMap,
  onNewMap,
}) => {
  const _ = useTranslation();
  const others = maps.filter((entry) => entry.mapId !== mapId);
  const listed = maps.some((entry) => entry.mapId === mapId)
    ? maps
    : [{ mapId, title: currentTitle }, ...others];
  return (
    <select
      aria-label={_('Mind map')}
      className='select select-ghost select-sm max-w-48 font-semibold'
      value={mapId}
      onChange={(event) =>
        event.target.value === NEW_MAP_OPTION ? onNewMap() : onSwitchMap(event.target.value)
      }
    >
      {listed.map((entry) => (
        <option key={entry.mapId} value={entry.mapId}>
          {(entry.mapId === mapId ? currentTitle : entry.title) || _('Untitled map')}
        </option>
      ))}
      <option value={NEW_MAP_OPTION}>{_('New map…')}</option>
    </select>
  );
};

export default MapSwitcher;
