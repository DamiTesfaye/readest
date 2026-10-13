import type { HlcClock } from '@/services/mindmap/file/clock';
import { stampMeta } from '@/services/mindmap/file/stampDiff';
import {
  CURRENT_SCHEMA_VERSION,
  type MapFile,
  type MapMeta,
} from '@/services/mindmap/schema/types';

export const createMapFile = (meta: MapMeta, mapId: string, clock: HlcClock): MapFile =>
  stampMeta({ schemaVersion: CURRENT_SCHEMA_VERSION, mapId, meta: {}, records: {} }, meta, clock);
