import type { Atom } from '@/services/mindmap/atom';
import { reconcile } from '@/services/mindmap/generate/reconcile';
import type { GenerateInput, MapGenerator } from '@/services/mindmap/generate/types';
import { layoutNewNodes } from '@/services/mindmap/layout/layout';
import type { MapMeta } from '@/services/mindmap/schema/types';
import { isEmptyDiff } from '@/services/mindmap/store/mapStore';
import type { CanvasController } from '@/services/mindmap/tools/controller';
import { uniqueId } from '@/utils/misc';

export type ReconcileOutcome = 'applied' | 'unchanged' | 'skipped' | 'failed';

export interface ReconcileMapInput {
  controller: CanvasController;
  meta: MapMeta;
  generator: MapGenerator;
  input: GenerateInput;
  signal?: AbortSignal;
  createId?: () => string;
}

const gestureEnd = (gesture: Atom<boolean>, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const done = (): void => {
      if (gesture.get() && !signal?.aborted) return;
      unsubscribe();
      signal?.removeEventListener('abort', done);
      resolve();
    };
    const unsubscribe = gesture.subscribe(done);
    signal?.addEventListener('abort', done);
    done();
  });

export const reconcileMap = async ({
  controller,
  meta,
  generator,
  input,
  signal,
  createId = uniqueId,
}: ReconcileMapInput): Promise<ReconcileOutcome> => {
  if (meta.source !== 'generated' || controller.readOnly) return 'skipped';
  try {
    const generated = await generator.generate(input);
    await gestureEnd(controller.gesture, signal);
    if (signal?.aborted) return 'skipped';
    const { store, spatial } = controller;
    const diff = reconcile(store.all(), generated, {
      createId,
      place: (nodes) => layoutNewNodes(store, spatial, nodes),
      isGone: (genKey) => generator.isGone?.(genKey, input) ?? true,
    });
    if (isEmptyDiff(diff)) return 'unchanged';
    store.applyGenerated(diff);
    return 'applied';
  } catch (error) {
    console.error('mindmap: generation failed', error);
    return 'failed';
  }
};
