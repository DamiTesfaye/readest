import { getMarginsCore } from '../marginsClient';
import type { LayerRow, MarginsStore } from '../store';
import { toScalarSpan, type ScalarSpan } from './offsets';

const loaded = new Set<string>();

export const publishSpan = async (
  store: MarginsStore,
  row: LayerRow,
): Promise<ScalarSpan | null> => {
  const core = getMarginsCore();
  if (!loaded.has(row.fileHash)) {
    const map = await store.getTextMap(row.fileHash);
    if (!map) return null;
    await core.loadBook(row.fileHash, map);
    loaded.add(row.fileHash);
  }
  const placed = await core.resolve(row.fileHash, row.anchor, null, false);
  if (placed.result !== 'placed') return null;
  return toScalarSpan(core, row.fileHash, placed.section, placed.start, placed.end);
};
