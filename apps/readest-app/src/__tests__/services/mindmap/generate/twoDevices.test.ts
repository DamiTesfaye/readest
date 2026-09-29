import { afterEach, describe, expect, it } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { HlcGenerator } from '@/libs/crdt';
import type { TOCItem } from '@/libs/document';
import { createMindmapClock } from '@/services/mindmap/file/clock';
import { createMapFile } from '@/services/mindmap/file/createMapFile';
import type { BookLocator } from '@/services/mindmap/generate/anchors';
import { reconcileMap } from '@/services/mindmap/generate/reconcileMap';
import { seedGenerator } from '@/services/mindmap/generate/seedGenerator';
import type { GenerateInput } from '@/services/mindmap/generate/types';
import { saveMapFile } from '@/services/mindmap/persist/mapFile';
import {
  type MapSession,
  __resetMapSessionsForTests,
  openMapSession,
} from '@/services/mindmap/persist/session';
import { DEFAULT_MAP_META, type MapFile } from '@/services/mindmap/schema/types';
import { isLive } from '@/services/mindmap/spatial/spatialIndex';
import { type CanvasController, createCanvasController } from '@/services/mindmap/tools/controller';
import type { Book, BookNote } from '@/types/book';

const BOOK = 'bookhash1';
const MAP = 'map1';

const TOC: TOCItem[] = [
  { id: 1, label: 'One', href: 'c1.xhtml', index: 0 } as TOCItem,
  { id: 2, label: 'Two', href: 'c2.xhtml', index: 1 } as TOCItem,
];

const locator: BookLocator = {
  locateToc: (item) => ({
    cfi: `epubcfi(/6/${item.index})`,
    section: item.index!,
    progress: item.index! / 2,
  }),
  locateCfi: (cfi) => ({ cfi, section: 1, progress: 0.6 }),
};

const note = (id: string, text: string, deletedAt?: number): BookNote =>
  ({
    id,
    type: 'annotation',
    cfi: `epubcfi(/6/4!/4/${id})`,
    text,
    note: '',
    createdAt: 1,
    updatedAt: 1,
    ...(deletedAt ? { deletedAt } : {}),
  }) as BookNote;

const inputOf = (annotations: BookNote[], toc: TOCItem[] = TOC): GenerateInput => ({
  book: { hash: BOOK, title: 'Book', format: 'EPUB' } as Book,
  toc,
  annotations,
  intent: 'story',
  locator,
});

interface Device {
  session: MapSession;
  controller: CanvasController;
}

const opened: Device[] = [];

const openDevice = async (deviceId: string, file: MapFile): Promise<Device> => {
  __resetMapSessionsForTests();
  const fs = new MemoryFileSystem();
  const clock = createMindmapClock(new HlcGenerator(deviceId), deviceId);
  await saveMapFile(fs, BOOK, file);
  const result = await openMapSession(fs, BOOK, MAP, clock);
  if (result.status !== 'open') throw new Error('expected an open session');
  const controller = createCanvasController({
    store: result.session.store,
    camera: result.session.meta().camera,
  });
  const device = { session: result.session, controller };
  opened.push(device);
  return device;
};

const twoDevices = async (): Promise<[Device, Device]> => {
  const base = createMapFile(
    { ...DEFAULT_MAP_META, source: 'generated' },
    MAP,
    createMindmapClock(new HlcGenerator('origin'), 'origin'),
  );
  return [await openDevice('device-a', base), await openDevice('device-b', base)];
};

const reconcileOn = (device: Device, input: GenerateInput) =>
  reconcileMap({
    controller: device.controller,
    meta: device.session.meta(),
    generator: seedGenerator,
    input,
  });

const liveByKey = (device: Device, genKey: string) =>
  device.session.store.all().filter((record) => isLive(record) && record.genKey === genKey);

const pushTo = (from: Device, to: Device) => to.session.mergeRemote(from.session.file());

afterEach(async () => {
  for (const device of opened.splice(0)) {
    device.controller.dispose();
    await device.session.close();
  }
  __resetMapSessionsForTests();
});

describe('generated maps on two devices', () => {
  it('keeps a moved quote keyed on a device whose booknotes have not synced yet', async () => {
    const [a, b] = await twoDevices();
    const notes = [note('h1', 'Quote one')];
    await reconcileOn(a, inputOf(notes));
    const quote = liveByKey(a, 'note:h1')[0]!;
    a.session.store.update(quote.id, { x: 1024, y: 1024 });
    pushTo(a, b);
    await reconcileOn(b, inputOf([]));
    pushTo(b, a);
    await reconcileOn(a, inputOf(notes));
    expect(liveByKey(a, 'note:h1').map((record) => record.id)).toEqual([quote.id]);
    expect(a.session.store.get(quote.id)).toMatchObject({ origin: 'generated', x: 1024 });
  });

  it('never hides an untouched quote from a device whose booknotes have not synced yet', async () => {
    const [a, b] = await twoDevices();
    const notes = [note('h1', 'Quote one')];
    await reconcileOn(a, inputOf(notes));
    pushTo(a, b);
    await reconcileOn(b, inputOf([]));
    pushTo(b, a);
    expect(liveByKey(a, 'note:h1')).toHaveLength(1);
    expect(liveByKey(a, 'link:note:h1')).toHaveLength(1);
  });

  it('removes a quote on the other device once its highlight is deleted', async () => {
    const [a, b] = await twoDevices();
    await reconcileOn(a, inputOf([note('h1', 'Quote one')]));
    pushTo(a, b);
    await reconcileOn(b, inputOf([note('h1', 'Quote one', 5)]));
    pushTo(b, a);
    expect(liveByKey(a, 'note:h1')).toHaveLength(0);
    expect(liveByKey(a, 'link:note:h1')).toHaveLength(0);
  });

  it('keeps a quote the reader deleted gone after merging the copy another device made', async () => {
    const [a, b] = await twoDevices();
    const notes = [note('h1', 'Quote one')];
    await reconcileOn(a, inputOf(notes));
    await reconcileOn(b, inputOf(notes));
    const mine = liveByKey(a, 'note:h1')[0]!;
    a.controller.selection.set([mine.id]);
    a.controller.deleteSelection();
    pushTo(b, a);
    await reconcileOn(a, inputOf(notes));
    expect(liveByKey(a, 'note:h1')).toEqual([]);
  });
});
