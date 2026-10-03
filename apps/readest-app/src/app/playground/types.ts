import type { ReactNode } from 'react';

/** Usage status from the component inventory (docs/component-inventory.md). */
export type ComponentStatus = 'used' | 'stale' | 'framework' | 'test-only';

/** One live component demo rendered with realistic mock props. */
export interface DemoEntry {
  /** Display name of the component. */
  name: string;
  /** Source path relative to `src/`, e.g. `components/primitives/button.tsx`. */
  sourcePath: string;
  /** Usage status from the inventory. */
  status: ComponentStatus;
  /** A live React element rendered with mock props. */
  node: ReactNode;
  /** Optional caveat (e.g. "renders in a portal", "trigger-only"). */
  notes?: string;
}
