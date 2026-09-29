import type { BookLocator } from '@/services/mindmap/generate/anchors';
import type { BoundsRect } from '@/services/mindmap/records/geometry';
import type { ResolvedSpoiler } from '@/services/mindmap/reveal/adaptive';
import type { ChapterStart } from '@/services/mindmap/reveal/chapters';
import type { MapRecord, PositionedRecord } from '@/services/mindmap/schema/types';
import { snapToGrid } from '@/services/mindmap/snap/snap';
import {
  type RecordFilter,
  SHOW_ALL,
  isLive,
  isPositioned,
  recordBounds,
} from '@/services/mindmap/spatial/spatialIndex';
import { unionBounds } from '@/services/mindmap/tools/records';

export const CLUSTER_SIZE = { w: 256, h: 64 } as const;

export interface FogCluster extends BoundsRect {
  key: string;
  count: number;
}

export interface FogRedaction extends BoundsRect {
  id: string;
  chapter: number | null;
}

export interface RevealInput {
  records: readonly MapRecord[];
  spoiler: ResolvedSpoiler;
  progress: number;
  lastSeenProgress: number;
  chapterStarts: readonly ChapterStart[];
}

export interface RevealState {
  hidden: ReadonlySet<string>;
  clusters: FogCluster[];
  redacted: FogRedaction[];
  revealed: number;
  total: number;
  newIds: string[];
}

export const chapterAt = (chapters: readonly ChapterStart[], progress: number): number | null =>
  chapters.reduce<number | null>(
    (current, chapter) => (chapter.start <= progress ? chapter.number : current),
    null,
  );

export interface ReadingPosition {
  fraction: number;
  location: string;
}

export const readingFloor = (
  locator: BookLocator | null,
  position: ReadingPosition | null,
): number => {
  if (!position) return 0;
  const floor = locator && position.location ? locator.locateCfi(position.location) : null;
  return floor?.progress ?? position.fraction;
};

export const visibleFilter = (hidden: ReadonlySet<string>): RecordFilter =>
  hidden.size === 0 ? SHOW_ALL : (record) => !hidden.has(record.id);

const clustersOf = (hidden: readonly PositionedRecord[]): FogCluster[] => {
  const groups = new Map<string, PositionedRecord[]>();
  for (const record of hidden) {
    const key = record.parentId ?? '';
    const group = groups.get(key) ?? [];
    group.push(record);
    groups.set(key, group);
  }
  return [...groups].map(([key, members]) => {
    const box = unionBounds(members.map(recordBounds))!;
    return {
      key,
      count: members.length,
      ...CLUSTER_SIZE,
      x: snapToGrid(box.x + box.w / 2 - CLUSTER_SIZE.w / 2),
      y: snapToGrid(box.y),
    };
  });
};

export const computeReveal = ({
  records,
  spoiler,
  progress,
  lastSeenProgress,
  chapterStarts,
}: RevealInput): RevealState => {
  const counted = records.filter(
    (record): record is PositionedRecord => isLive(record) && isPositioned(record),
  );
  const ahead =
    spoiler === 'whole'
      ? []
      : counted.filter((record) => record.revealAt !== null && record.revealAt > progress);
  const hidden = new Set(ahead.map((record) => record.id));
  return {
    hidden,
    clusters: spoiler === 'grow' ? clustersOf(ahead) : [],
    redacted:
      spoiler === 'fogged'
        ? ahead.map(({ id, x, y, w, h, revealAt }) => ({
            id,
            x,
            y,
            w,
            h,
            chapter: chapterAt(chapterStarts, revealAt!),
          }))
        : [],
    revealed: counted.length - hidden.size,
    total: counted.length,
    newIds: (spoiler === 'whole' ? [] : counted)
      .filter(
        ({ revealAt }) => revealAt !== null && revealAt > lastSeenProgress && revealAt <= progress,
      )
      .map((record) => record.id),
  };
};
