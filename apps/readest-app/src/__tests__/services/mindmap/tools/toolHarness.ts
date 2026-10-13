import { type Atom, createAtom } from '@/services/mindmap/atom';
import { createCamera } from '@/services/mindmap/camera/camera';
import { createHistory } from '@/services/mindmap/history/history';
import type { MapRecord } from '@/services/mindmap/schema/types';
import { createSpatialIndex } from '@/services/mindmap/spatial/spatialIndex';
import { createMapStore } from '@/services/mindmap/store/mapStore';
import { topIndex } from '@/services/mindmap/tools/records';
import {
  type CanvasPointer,
  IDLE_LIVE,
  type LiveState,
  type Tool,
  type ToolContext,
  type ToolId,
} from '@/services/mindmap/tools/types';

export const pointer = (
  x: number,
  y: number,
  overrides: Partial<CanvasPointer> = {},
): CanvasPointer => ({
  id: 1,
  kind: 'mouse',
  button: 0,
  screen: { x, y },
  page: { x, y },
  pressure: 0.5,
  alt: false,
  shift: false,
  clicks: 1,
  target: { kind: 'canvas' },
  ...overrides,
});

export interface ToolHarness {
  ctx: ToolContext;
  tool: Atom<ToolId>;
}

export const toolHarness = (records: MapRecord[] = [], readOnly = false): ToolHarness => {
  const store = createMapStore(records);
  const tool = createAtom<ToolId>('select');
  let next = 0;
  const ctx: ToolContext = {
    store,
    history: createHistory(store),
    camera: createCamera({ x: 0, y: 0, z: 1 }),
    spatial: createSpatialIndex(store),
    selection: createAtom<readonly string[]>([]),
    live: createAtom<LiveState>(IDLE_LIVE),
    editing: createAtom<string | null>(null),
    readOnly,
    createId: () => {
      next += 1;
      return `new${next}`;
    },
    topIndex: () => topIndex(store),
    setTool: tool.set,
  };
  return { ctx, tool };
};

export const drive = (
  tool: Tool,
  from: [number, number],
  to: [number, number],
  overrides: Partial<CanvasPointer> = {},
): void => {
  tool.down(pointer(from[0], from[1], overrides));
  tool.move(pointer((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, overrides), []);
  tool.move(pointer(to[0], to[1], overrides), []);
  tool.up(pointer(to[0], to[1], overrides));
};
