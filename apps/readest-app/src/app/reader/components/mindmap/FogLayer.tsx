import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import type { BoundsRect } from '@/services/mindmap/records/geometry';
import type { FogCluster, FogRedaction } from '@/services/mindmap/reveal/visibility';

interface FogLayerProps {
  clusters: readonly FogCluster[];
  redacted: readonly FogRedaction[];
}

const FOG_CLASS =
  'pointer-events-none absolute flex items-center justify-center rounded-2xl border border-dashed px-3 text-center text-xs';

const fogStyle = ({ x, y, w, h }: BoundsRect): React.CSSProperties => ({
  left: x,
  top: y,
  width: w,
  height: h,
  background: 'var(--mm-fog)',
  borderColor: 'var(--mm-fog-border)',
  color: 'var(--mm-label-text)',
});

const FogLayer: React.FC<FogLayerProps> = ({ clusters, redacted }) => {
  const _ = useTranslation();
  return (
    <>
      {clusters.map((cluster) => (
        <div
          key={`cluster-${cluster.key}`}
          data-testid='mm-fog-cluster'
          className={FOG_CLASS}
          style={fogStyle(cluster)}
        >
          {_('Keep reading to reveal {{count}} more nodes', { count: cluster.count })}
        </div>
      ))}
      {redacted.map((fog) => (
        <div key={fog.id} data-testid='mm-fog-record' className={FOG_CLASS} style={fogStyle(fog)}>
          {fog.chapter === null ? _('Later') : _('Ch. {{chapter}}+', { chapter: fog.chapter })}
        </div>
      ))}
    </>
  );
};

export default FogLayer;
