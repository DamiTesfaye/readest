import React, { useMemo } from 'react';
import { linkShape } from '@/services/mindmap/records/linkGeometry';
import type { LinkRecord, MapStyle, PositionedRecord } from '@/services/mindmap/schema/types';
import { liveLinkEnds, recordBounds } from '@/services/mindmap/spatial/spatialIndex';
import type { MapStore } from '@/services/mindmap/store/mapStore';
import type { RegisterElement } from './RecordView';
import { useRecord } from './useCanvasStores';
import { sketchMarkup } from '@/styles/inkSkin';

interface LinkViewProps {
  link: LinkRecord;
  from: PositionedRecord;
  to: PositionedRecord;
  mapStyle: MapStyle;
  register: RegisterElement;
  sketch?: boolean;
}

const shapeOf = ({ link, from, to }: Pick<LinkViewProps, 'link' | 'from' | 'to'>) =>
  linkShape(recordBounds(from), recordBounds(to), link);

const SketchedLinkView: React.FC<LinkViewProps> = ({ link, from, to, mapStyle, register }) => {
  const shape = shapeOf({ link, from, to });
  const svg = useMemo(
    () =>
      sketchMarkup(link.id, 0, 0, (ink) => {
        ink.stroke(
          shape.points.map((p) => [p.x, p.y]),
          'ink',
          { color: 'current', width: mapStyle === 'sticker' ? 1.4 : 1 },
        );
      }).svg,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [link.id, shape.d, mapStyle],
  );
  return (
    <g
      ref={(element) => (element ? register(link.id, element) : undefined)}
      data-record-id={link.id}
      data-testid={`mm-link-${link.id}`}
      style={{ color: 'var(--mm-link)' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

const LinkPathView: React.FC<LinkViewProps> = (props) => {
  const { link, from, to, mapStyle, register, sketch } = props;
  if (sketch && !link.dash) return <SketchedLinkView {...props} />;
  return (
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
};

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

interface LinkSlotProps {
  id: string;
  store: MapStore;
  mapStyle: MapStyle;
  register: RegisterElement;
  sketch?: boolean;
}

const useLinkEnds = (store: MapStore, id: string) => {
  const record = useRecord(store, id);
  const link = record?.type === 'link' ? record : null;
  const from = useRecord(store, link?.fromId ?? '');
  const to = useRecord(store, link?.toId ?? '');
  if (!link || link.deleted !== null) return null;
  const ends = liveLinkEnds(link, (endId) => (endId === link.fromId ? from : to));
  return ends ? { link, from: ends[0], to: ends[1] } : null;
};

const LinkPathSlot: React.FC<LinkSlotProps> = ({ id, store, ...rest }) => {
  const view = useLinkEnds(store, id);
  return view ? <LinkPathView {...view} {...rest} /> : null;
};

const LinkLabelSlot: React.FC<LinkSlotProps> = ({ id, store, ...rest }) => {
  const view = useLinkEnds(store, id);
  return view ? <LinkLabelView {...view} {...rest} /> : null;
};

export const LinkPath = React.memo(LinkPathSlot);
export const LinkLabel = React.memo(LinkLabelSlot);
