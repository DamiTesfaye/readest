import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { HlcGenerator } from '@/libs/crdt';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { createMapFile } from '@/services/mindmap/file/createMapFile';
import { reconcileMap } from '@/services/mindmap/generate/reconcileMap';
import type {
  GenNode,
  GenRecord,
  GenerateInput,
  MapGenerator,
} from '@/services/mindmap/generate/types';
import { readMapFile, saveMapFile } from '@/services/mindmap/persist/mapFile';
import {
  type MapSession,
  __resetMapSessionsForTests,
  openMapSession,
} from '@/services/mindmap/persist/session';
import { DEFAULT_MAP_META, type MapMeta, type NodeRecord } from '@/services/mindmap/schema/types';
import { type CanvasController, createCanvasController } from '@/services/mindmap/tools/controller';
import type { Book } from '@/types/book';

const BOOK = 'book1';
const MAP = 'm1';

const chapter = (genKey: string, label: string): GenNode => ({
  type: 'node',
  genKey,
  kind: 'chapter',
  label,
  color: 'sky',
  anchor: { cfi: 'epubcfi(/6/4)', section: 1, progress: 0.25 },
  revealAt: 0.25,
  parentGenKey: null,
});

const fixed = (records: GenRecord[]): MapGenerator => ({
  id: 'fixed',
  generate: async () => records,
});

const input: GenerateInput = {
  book: { hash: BOOK, title: 'Emma', format: 'EPUB' } as Book,
  toc: [],
  annotations: [],
  intent: 'story',
  locator: { locateToc: () => null, locateCfi: () => null },
};

let fs: MemoryFileSystem;
let session: MapSession;
let controller: CanvasController;

const openMap = async (meta: Partial<MapMeta> = {}): Promise<void> => {
  const clock = createMindmapClock(new HlcGenerator('device-1'), 'device-1');
  await saveMapFile(
    fs,
    BOOK,
    createMapFile({ ...DEFAULT_MAP_META, source: 'generated', ...meta }, MAP, clock),
  );
  const result = await openMapSession(fs, BOOK, MAP, clock);
  if (result.status !== 'open') throw new Error('expected an open session');
  session = result.session;
  controller = createCanvasController({ store: session.store, camera: session.meta().camera });
};

const run = (generator: MapGenerator, meta: MapMeta = session.meta()) =>
  reconcileMap({ controller, meta, generator, input });

const savedLabel = async (id: string): Promise<unknown> => {
  await session.flush();
  const read = await readMapFile(fs, BOOK, MAP);
  return read!.file.records[id]!['label']!.v;
};

beforeEach(async () => {
  fs = new MemoryFileSystem();
  await openMap();
});

afterEach(async () => {
  controller.dispose();
  await session.close();
  __resetMapSessionsForTests();
});

describe('reconcileMap', () => {
  it('saves generated records through the session and keeps them out of history', async () => {
    expect(await run(fixed([chapter('toc:a', 'Chapter A')]))).toBe('applied');
    const [record] = session.store.all();
    expect(record).toMatchObject({ genKey: 'toc:a', origin: 'generated', label: 'Chapter A' });
    expect(record!.id).not.toBe('toc:a');
    expect(controller.history.canUndo()).toBe(false);
    expect(await savedLabel(record!.id)).toBe('Chapter A');
  });

  it('writes a tombstone with null content and restores it on revival', async () => {
    await run(fixed([chapter('toc:a', 'Chapter A')]));
    const id = session.store.all()[0]!.id;
    expect(await run(fixed([]))).toBe('applied');
    expect(session.store.get(id)).toMatchObject({ deleted: { by: 'gen' }, label: 'Chapter A' });
    expect(await savedLabel(id)).toBeNull();
    expect(await run(fixed([chapter('toc:a', 'Chapter A')]))).toBe('applied');
    expect((session.store.get(id) as NodeRecord).deleted).toBeNull();
    expect(await savedLabel(id)).toBe('Chapter A');
  });

  it('reports an unchanged map without writing', async () => {
    await run(fixed([chapter('toc:a', 'Chapter A')]));
    const listener = vi.fn();
    session.store.listen(listener);
    expect(await run(fixed([chapter('toc:a', 'Chapter A')]))).toBe('unchanged');
    expect(listener).not.toHaveBeenCalled();
  });

  it('never reconciles a blank map', async () => {
    const generate = vi.fn(async () => [chapter('toc:a', 'A')]);
    const outcome = await run({ id: 'spy', generate }, { ...session.meta(), source: 'blank' });
    expect(outcome).toBe('skipped');
    expect(generate).not.toHaveBeenCalled();
  });

  it('never reconciles a read-only map', async () => {
    const readOnly = createCanvasController({
      store: session.store,
      camera: session.meta().camera,
      readOnly: true,
    });
    const outcome = await reconcileMap({
      controller: readOnly,
      meta: session.meta(),
      generator: fixed([chapter('toc:a', 'A')]),
      input,
    });
    readOnly.dispose();
    expect(outcome).toBe('skipped');
    expect(session.store.all()).toEqual([]);
  });

  it('leaves the map untouched when the generator fails', async () => {
    await run(fixed([chapter('toc:a', 'Chapter A')]));
    const before = session.store.all();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failing: MapGenerator = {
      id: 'broken',
      generate: async () => {
        throw new Error('boom');
      },
    };
    expect(await run(failing)).toBe('failed');
    expect(session.store.all()).toBe(before);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('waits for the current gesture to end before applying', async () => {
    controller.gesture.set(true);
    const pending = run(fixed([chapter('toc:a', 'Chapter A')]));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(session.store.all()).toEqual([]);
    controller.gesture.set(false);
    expect(await pending).toBe('applied');
    expect(session.store.all()).toHaveLength(1);
  });

  it('skips when the signal aborts before the gesture ends', async () => {
    const abort = new AbortController();
    controller.gesture.set(true);
    const pending = reconcileMap({
      controller,
      meta: session.meta(),
      generator: fixed([chapter('toc:a', 'A')]),
      input,
      signal: abort.signal,
    });
    abort.abort();
    controller.gesture.set(false);
    expect(await pending).toBe('skipped');
    expect(session.store.all()).toEqual([]);
  });
});
