import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { compareByIndex } from '@/services/mindmap/order/keyBetween';
import type { MapRecord, MapStyle } from '@/services/mindmap/schema/types';
import { type RecordFilter, isPositioned, isShown } from '@/services/mindmap/spatial/spatialIndex';
import type { Diff } from '@/services/mindmap/store/mapStore';
import type { CanvasController } from '@/services/mindmap/tools/controller';
import { getLocale } from '@/utils/misc';
import { LinkLabel, LinkPath } from './LinkView';
import { type RegisterElement, RecordSlot } from './RecordView';
import { recordAriaLabels } from './recordLabels';
import { useAtomValue, useMapRecordsWhen } from './useCanvasStores';

export const CULL_MARGIN_PX = 200;
export const CAMERA_SETTLE_MS = 150;

const ORDER_FIELDS: ReadonlySet<string> = new Set(['index', 'deleted', 'type', 'fromId', 'toId']);
const LABEL_FIELDS: ReadonlySet<string> = new Set([...ORDER_FIELDS, 'label', 'text', 'kind']);

interface WorldIds {
  sections: string[];
  others: string[];
  links: string[];
}

const partition = (
  records: readonly MapRecord[],
  filter: RecordFilter,
  lookup: (id: string) => MapRecord | undefined,
): WorldIds => {
  const shown = records.filter((record) => isShown(record, filter, lookup)).sort(compareByIndex);
  return {
    sections: shown.filter((r) => r.type === 'section').map((r) => r.id),
    others: shown.filter((r) => isPositioned(r) && r.type !== 'section').map((r) => r.id),
    links: shown.filter((r) => r.type === 'link').map((r) => r.id),
  };
};

interface WorldLayerProps {
  controller: CanvasController;
  mapStyle: MapStyle;
  animate: boolean;
  children?: React.ReactNode;
}

const WorldLayer: React.FC<WorldLayerProps> = ({ controller, mapStyle, animate, children }) => {
  const _ = useTranslation();
  const { store } = controller;
  const rendered = useRef(new Set<string>());

  const touches = useCallback(
    (fields: ReadonlySet<string>) => (diff: Diff) =>
      diff.added.length > 0 ||
      diff.discarded.length > 0 ||
      diff.changed.some(
        (change) =>
          fields.has(change.field) ||
          rendered.current.has(change.id) !== controller.isShown(change.id),
      ),
    [controller],
  );
  const touchesOrder = useMemo(() => touches(ORDER_FIELDS), [touches]);
  const touchesLabels = useMemo(() => touches(LABEL_FIELDS), [touches]);
  const orderRecords = useMapRecordsWhen(store, touchesOrder);
  const labelRecords = useMapRecordsWhen(store, touchesLabels);
  const visible = useAtomValue(controller.visible);

  const ids = useMemo(
    () => partition(orderRecords, visible, store.get),
    [orderRecords, visible, store],
  );
  const labels = useMemo(
    () =>
      recordAriaLabels(
        labelRecords.filter((record) => isShown(record, visible, store.get)),
        _,
        getLocale(),
      ),
    [labelRecords, visible, store, _],
  );
  const shownIds = useMemo(() => new Set([...ids.sections, ...ids.others, ...ids.links]), [ids]);
  const [popped] = useState(() => new Set(shownIds));
  const markPopped = useCallback((id: string) => popped.add(id), [popped]);
  useLayoutEffect(() => {
    rendered.current = shownIds;
  }, [shownIds]);

  const worldRef = useRef<HTMLDivElement>(null);
  const elements = useRef(new Map<HTMLElement | SVGElement, string>());
  const moving = useRef(false);

  const cull = useCallback(() => {
    const view = controller.viewport.get();
    const cullAll = view.width === 0 || view.height === 0;
    const bounds = controller.camera.viewportBounds(view);
    const margin = CULL_MARGIN_PX / controller.camera.get().z;
    const area = {
      x: bounds.x - margin,
      y: bounds.y - margin,
      w: bounds.w + margin * 2,
      h: bounds.h + margin * 2,
    };
    const onScreen = new Set([
      ...controller.spatial.search(area),
      ...controller.spatial.searchLinks(area),
    ]);
    const selection = controller.selection.get();
    if (selection.length === 1) onScreen.add(selection[0]!);
    const focused = document.activeElement;
    if (focused instanceof Element && worldRef.current?.contains(focused)) {
      const id = focused.getAttribute('data-record-id');
      if (id) onScreen.add(id);
    }
    for (const [element, id] of elements.current) {
      const display = cullAll || onScreen.has(id) ? '' : 'none';
      if (display === 'none' && moving.current) continue;
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
    let settle: ReturnType<typeof setTimeout> | undefined;
    let settledScale = controller.camera.get().z;
    const place = (): void => {
      const { x, y, z } = controller.camera.get();
      world.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
      cull();
    };
    const move = (): void => {
      moving.current = true;
      place();
      if (controller.camera.get().z !== settledScale) world.style.willChange = 'transform';
      clearTimeout(settle);
      settle = setTimeout(() => {
        moving.current = false;
        settledScale = controller.camera.get().z;
        world.style.willChange = '';
        cull();
      }, CAMERA_SETTLE_MS);
    };
    place();
    const unsubscribers = [
      controller.camera.subscribe(move),
      controller.viewport.subscribe(cull),
      controller.selection.subscribe(cull),
      store.listen(cull),
    ];
    return () => {
      moving.current = false;
      clearTimeout(settle);
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [controller, store, cull]);

  useLayoutEffect(cull, [cull, ids]);

  const renderRecord = (id: string) => (
    <RecordSlot
      key={id}
      id={id}
      store={store}
      mapStyle={mapStyle}
      ariaLabel={labels.get(id)}
      pop={animate && !popped.has(id)}
      register={register}
      onPopped={markPopped}
    />
  );

  return (
    <div
      ref={worldRef}
      data-testid='mm-world'
      className='pointer-events-none absolute left-0 top-0'
      style={{ transformOrigin: '0 0' }}
    >
      {ids.sections.map(renderRecord)}
      <svg
        data-testid='mm-links'
        className='pointer-events-none absolute left-0 top-0 overflow-visible'
        width={1}
        height={1}
        aria-hidden='true'
      >
        {ids.links.map((id) => (
          <LinkPath key={id} id={id} store={store} mapStyle={mapStyle} register={register} />
        ))}
      </svg>
      {ids.others.map(renderRecord)}
      {ids.links.map((id) => (
        <LinkLabel key={id} id={id} store={store} mapStyle={mapStyle} register={register} />
      ))}
      {children}
    </div>
  );
};

export default WorldLayer;
