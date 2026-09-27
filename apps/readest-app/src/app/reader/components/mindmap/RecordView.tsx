import clsx from 'clsx';
import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { inkRecordPath } from '@/services/mindmap/ink/inkPath';
import type {
  InkRecord,
  MapStyle,
  NodeRecord,
  PositionedRecord,
  PresetColor,
  SectionRecord,
  ShapeRecord,
} from '@/services/mindmap/schema/types';

export type RegisterElement = (id: string, element: HTMLElement | SVGElement) => () => void;

export const POP_CLASS = 'animate-mm-pop';
const STICKY_TILT_DEG = 2;

interface RecordViewProps {
  record: PositionedRecord;
  mapStyle: MapStyle;
  ariaLabel: string | undefined;
  pop: boolean;
  register: RegisterElement;
}

const token = (color: PresetColor, part: 'fill' | 'text' | 'rim' | 'stroke'): string =>
  `var(--mm-${color}-${part})`;

export const stickyTilt = (id: string): number => {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return ((Math.abs(hash) % 201) / 100 - 1) * STICKY_TILT_DEG;
};

const QuoteNote: React.FC<{ record: NodeRecord }> = ({ record }) => {
  const _ = useTranslation();
  const caption = record.anchor
    ? _('Ch. {{chapter}} · your highlight', { chapter: record.anchor.section + 1 })
    : _('Your highlight');
  return (
    <div
      className='relative flex h-full w-full flex-col justify-center rounded-sm px-3 pb-1 pt-3 font-serif text-sm'
      style={{
        backgroundColor: 'var(--mm-quote-paper)',
        color: 'var(--mm-label-text)',
        boxShadow: '2px 2px 0 var(--mm-shadow)',
        backgroundImage:
          'repeating-linear-gradient(transparent 0 15px, color-mix(in srgb, var(--mm-link) 35%, transparent) 15px 16px)',
      }}
    >
      <span
        aria-hidden='true'
        className='absolute -top-2 left-1/2 h-4 w-12 -translate-x-1/2 -rotate-2'
        style={{ background: 'var(--mm-quote-tape)' }}
      />
      <span className='line-clamp-3'>{record.label}</span>
      <span className='mt-1 text-xs' style={{ color: 'var(--mm-label-text)' }}>
        {caption}
      </span>
    </div>
  );
};

const NodeBody: React.FC<{ record: NodeRecord; mapStyle: MapStyle }> = ({ record, mapStyle }) => {
  if (record.kind === 'quote') return <QuoteNote record={record} />;
  const initial = record.label.trim().charAt(0).toUpperCase();
  if (mapStyle === 'paper') {
    return (
      <div
        className='flex h-full w-full items-center gap-2 overflow-hidden rounded-md border ps-0 pe-3 text-sm shadow-sm'
        style={{
          background: 'var(--mm-label-bg)',
          color: 'var(--mm-label-text)',
          borderColor: 'var(--mm-link)',
        }}
      >
        <span
          className='h-full w-1.5 shrink-0'
          style={{ background: token(record.color, 'fill') }}
        />
        <span className='truncate'>{record.label}</span>
      </div>
    );
  }
  if (mapStyle === 'ink') {
    return (
      <div
        className='flex h-full w-full items-center justify-center rounded-full border-2 px-3 font-serif text-sm'
        style={{ borderColor: token(record.color, 'stroke'), color: 'var(--mm-label-text)' }}
      >
        <span className='truncate'>{record.label}</span>
      </div>
    );
  }
  return (
    <div
      className='flex h-full w-full items-center gap-2 rounded-full border-[3px] ps-1.5 pe-4 text-sm font-semibold'
      style={{
        background: token(record.color, 'fill'),
        color: token(record.color, 'text'),
        borderColor: token(record.color, 'rim'),
        boxShadow: '3px 3px 0 var(--mm-shadow), inset 0 0 0 1px var(--mm-edge)',
      }}
    >
      <span
        aria-hidden='true'
        className='flex aspect-square h-[70%] shrink-0 items-center justify-center rounded-full text-xs'
        style={{ background: token(record.color, 'rim'), color: token(record.color, 'fill') }}
      >
        {initial}
      </span>
      <span className='truncate'>{record.label}</span>
    </div>
  );
};

const SectionBody: React.FC<{ record: SectionRecord; mapStyle: MapStyle }> = ({
  record,
  mapStyle,
}) => (
  <div
    className='h-full w-full rounded-xl border-2 border-dashed'
    style={{ background: 'var(--mm-section)', borderColor: 'var(--mm-section-border)' }}
  >
    <span
      className={clsx(
        'absolute -top-3 start-3 max-w-[80%] truncate rounded-full px-3 py-0.5 text-xs font-semibold',
        mapStyle === 'ink' && 'border',
      )}
      style={
        mapStyle === 'ink'
          ? {
              background: 'var(--mm-label-bg)',
              color: 'var(--mm-label-text)',
              borderColor: 'var(--mm-link)',
            }
          : { background: token(record.color, 'fill'), color: token(record.color, 'text') }
      }
    >
      {record.title}
    </span>
  </div>
);

const ShapeBody: React.FC<{ record: ShapeRecord; mapStyle: MapStyle }> = ({ record, mapStyle }) => {
  const fill = record.fill === 'tint' && mapStyle !== 'ink' ? token(record.color, 'fill') : 'none';
  const props = { fill, fillOpacity: 0.2, stroke: token(record.color, 'stroke'), strokeWidth: 2 };
  const { w, h } = record;
  return (
    <svg className='h-full w-full overflow-visible' viewBox={`0 0 ${w} ${h}`} aria-hidden='true'>
      {record.geo === 'ellipse' && (
        <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...props} />
      )}
      {record.geo === 'rect' && <rect width={w} height={h} rx={8} {...props} />}
      {record.geo === 'diamond' && (
        <polygon points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`} {...props} />
      )}
    </svg>
  );
};

const InkBody: React.FC<{ record: InkRecord }> = ({ record }) => (
  <svg className='h-full w-full overflow-visible' aria-hidden='true'>
    <path
      data-testid='mm-ink-path'
      d={inkRecordPath(record)}
      fill={token(record.color, 'stroke')}
    />
  </svg>
);

const RecordBody: React.FC<{ record: PositionedRecord; mapStyle: MapStyle }> = ({
  record,
  mapStyle,
}) => {
  if (record.type === 'node') return <NodeBody record={record} mapStyle={mapStyle} />;
  if (record.type === 'section') return <SectionBody record={record} mapStyle={mapStyle} />;
  if (record.type === 'shape') return <ShapeBody record={record} mapStyle={mapStyle} />;
  if (record.type === 'ink') return <InkBody record={record} />;
  if (record.type === 'sticky') {
    return (
      <div
        className='h-full w-full overflow-hidden whitespace-pre-wrap p-3 text-sm'
        style={{
          background: 'var(--mm-sticky-fill)',
          color: 'var(--mm-sticky-text)',
          boxShadow: mapStyle === 'ink' ? 'none' : '2px 3px 0 var(--mm-shadow)',
          border: mapStyle === 'ink' ? '1px solid var(--mm-link)' : 'none',
          transform: `rotate(${stickyTilt(record.id)}deg)`,
        }}
      >
        {record.text}
      </div>
    );
  }
  return (
    <div
      className='h-full w-full whitespace-pre-wrap'
      style={{ fontSize: record.size, color: 'var(--mm-label-text)' }}
    >
      {record.text}
    </div>
  );
};

const RecordView: React.FC<RecordViewProps> = ({ record, mapStyle, ariaLabel, pop, register }) => (
  <div
    ref={(element) => (element ? register(record.id, element) : undefined)}
    data-record-id={record.id}
    data-testid={`mm-record-${record.id}`}
    role={ariaLabel ? 'button' : undefined}
    tabIndex={ariaLabel ? -1 : undefined}
    aria-label={ariaLabel}
    className='absolute outline-none'
    style={{ left: record.x, top: record.y, width: record.w, height: record.h }}
  >
    <div className={clsx('h-full w-full', pop && POP_CLASS)}>
      <RecordBody record={record} mapStyle={mapStyle} />
    </div>
  </div>
);

export default React.memo(RecordView);
