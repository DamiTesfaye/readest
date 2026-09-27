import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { compareByIndex } from '@/services/mindmap/order/keyBetween';
import type { LinkRecord, MapStyle, PositionedRecord } from '@/services/mindmap/schema/types';
import { isLive, isPositioned, liveLinkEnds } from '@/services/mindmap/spatial/spatialIndex';
import type { CanvasController } from '@/services/mindmap/tools/controller';
import { LinkLabel, LinkPath } from './LinkView';
import RecordView, { type RegisterElement } from './RecordView';
import { recordAriaLabels } from './recordLabels';
import { useMapRecords } from './useCanvasStores';

export const CULL_MARGIN_PX = 200;

interface WorldLayerProps {
  controller: CanvasController;
  mapStyle: MapStyle;
  animate: boolean;
}

const WorldLayer: React.FC<WorldLayerProps> = ({ controller, mapStyle, animate }) => {
  const _ = useTranslation();
  const records = useMapRecords(controller.store);
  const worldRef = useRef<HTMLDivElement>(null);
  const elements = useRef(new Map<HTMLElement | SVGElement, string>());
  const linksRef = useRef<LinkRecord[]>([]);
  const [initialIds] = useState(() => new Set(records.map((record) => record.id)));

  const { sections, others, links } = useMemo(() => {
    const live = records.filter(isLive).sort(compareByIndex);
    const positioned = live.filter(isPositioned);
    return {
      sections: positioned.filter((record) => record.type === 'section'),
      others: positioned.filter((record) => record.type !== 'section'),
      links: live.filter((record): record is LinkRecord => record.type === 'link'),
    };
  }, [records]);
  const labels = useMemo(() => recordAriaLabels(records, _), [records, _]);
  linksRef.current = links;

  const cull = useCallback(() => {
    const view = controller.viewport.get();
    const cullAll = view.width === 0 || view.height === 0;
    const bounds = controller.camera.viewportBounds(view);
    const margin = CULL_MARGIN_PX / controller.camera.get().z;
    const visible = new Set(
      controller.spatial.search({
        x: bounds.x - margin,
        y: bounds.y - margin,
        w: bounds.w + margin * 2,
        h: bounds.h + margin * 2,
      }),
    );
    for (const link of linksRef.current) {
      if (visible.has(link.fromId) || visible.has(link.toId)) visible.add(link.id);
    }
    for (const [element, id] of elements.current) {
      const display = cullAll || visible.has(id) ? '' : 'none';
      if (element.style.display !== display) element.style.display = display;
    }
  }, [controller]);

  const register = useCallback<RegisterElement>((id, element) => {
    elements.current.set(element, id);
    return () => {
      elements.current.delete(element);
    };
  }, []);

  useEffect(() => {
    const world = worldRef.current!;
    const apply = (): void => {
      const { x, y, z } = controller.camera.get();
      world.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
      cull();
    };
    apply();
    const unsubscribeCamera = controller.camera.subscribe(apply);
    const unsubscribeViewport = controller.viewport.subscribe(cull);
    return () => {
      unsubscribeCamera();
      unsubscribeViewport();
    };
  }, [controller, cull]);

  useLayoutEffect(cull, [cull, records]);

  const renderRecord = (record: PositionedRecord) => (
    <RecordView
      key={record.id}
      record={record}
      mapStyle={mapStyle}
      ariaLabel={labels.get(record.id)}
      pop={animate && !initialIds.has(record.id)}
      register={register}
    />
  );

  const linkViews = links.flatMap((link) => {
    const ends = liveLinkEnds(link, controller.store.get);
    return ends ? [{ link, from: ends[0], to: ends[1] }] : [];
  });

  return (
    <div
      ref={worldRef}
      data-testid='mm-world'
      className='pointer-events-none absolute left-0 top-0'
      style={{ transformOrigin: '0 0' }}
    >
      {sections.map(renderRecord)}
      <svg
        data-testid='mm-links'
        className='pointer-events-none absolute left-0 top-0 overflow-visible'
        width={1}
        height={1}
        aria-hidden='true'
      >
        {linkViews.map((view) => (
          <LinkPath key={view.link.id} {...view} mapStyle={mapStyle} register={register} />
        ))}
      </svg>
      {others.map(renderRecord)}
      {linkViews.map((view) => (
        <LinkLabel key={view.link.id} {...view} mapStyle={mapStyle} register={register} />
      ))}
    </div>
  );
};

export default WorldLayer;
