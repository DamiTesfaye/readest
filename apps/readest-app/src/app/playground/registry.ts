import type { DemoEntry } from './types';
import { demos as g1 } from './demos/group-1';
import { demos as g2 } from './demos/group-2';
import { demos as g3 } from './demos/group-3';
import { demos as g4 } from './demos/group-4';
import { demos as g5 } from './demos/group-5';
import { demos as g6 } from './demos/group-6';

/** All live, renderable component demos, flattened from the per-group files. */
export const allDemos: DemoEntry[] = [...g1, ...g2, ...g3, ...g4, ...g5, ...g6].sort((a, b) =>
  a.name.localeCompare(b.name),
);
