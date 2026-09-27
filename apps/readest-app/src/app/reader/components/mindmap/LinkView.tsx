import React from 'react';
import { linkShape } from '@/services/mindmap/records/linkGeometry';
import type { LinkRecord, MapStyle, PositionedRecord } from '@/services/mindmap/schema/types';
import { recordBounds } from '@/services/mindmap/spatial/spatialIndex';
import type { RegisterElement } from './RecordView';

interface LinkViewProps {
  link: LinkRecord;
  from: PositionedRecord;
  to: PositionedRecord;
  mapStyle: MapStyle;
  register: RegisterElement;
}

const shapeOf = ({ link, from, to }: Pick<LinkViewProps, 'link' | 'from' | 'to'>) =>
  linkShape(recordBounds(from), recordBounds(to), link);

const LinkPathView: React.FC<LinkViewProps> = ({ link, from, to, mapStyle, register }) => (
  <path
    ref={(element) => (element ? register(link.id, element) : undefined)}
    data-record-id={link.id}
    data-testid={`mm-link-${link.id}`}
    d={shapeOf({ link, from, to }).d}
    fill='none'
    stroke='var(--mm-link)'
    strokeWidth={mapStyle === 'sticker' ? 3 : 2}
    strokeDasharray={link.dash ? '8 6' : undefined}
    strokeLinecap='round'
  />
);

const LinkLabelView: React.FC<LinkViewProps> = ({ link, from, to, mapStyle, register }) => {
  if (!link.label) return null;
  const { mid } = shapeOf({ link, from, to });
  return (
    <div
      ref={(element) => (element ? register(link.id, element) : undefined)}
      className='pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs'
      style={{
        left: mid.x,
        top: mid.y,
        background: 'var(--mm-label-bg)',
        color: 'var(--mm-label-text)',
        borderColor: mapStyle === 'sticker' ? 'transparent' : 'var(--mm-link)',
        fontFamily: mapStyle === 'ink' ? 'serif' : undefined,
      }}
    >
      {link.label}
    </div>
  );
};

export const LinkPath = React.memo(LinkPathView);
export const LinkLabel = React.memo(LinkLabelView);
