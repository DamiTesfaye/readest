import type {
  Anchor,
  BuildAnchorRequest,
  CanonicalSection,
  Resolution,
  SectionInput,
} from './types';

export interface MarginsCore {
  loadBook(fileHash: string, sections: SectionInput[]): Promise<void>;
  canonicalSection(fileHash: string, section: number): Promise<CanonicalSection>;
  fingerprint(fileHash: string): Promise<(string[] | null)[]>;
  buildAnchor(fileHash: string, req: BuildAnchorRequest): Promise<Anchor>;
  resolve(
    fileHash: string,
    anchor: Anchor,
    sameFile: [number, number, number] | null,
    otherFileInFamily: boolean,
  ): Promise<Resolution>;
  toRaw(
    fileHash: string,
    section: number,
    canonByte: number,
  ): Promise<{ run: number; utf16: number }>;
  fromRaw(fileHash: string, section: number, run: number, utf16: number): Promise<number>;
  mapOffset(from: string, to: string, fromUtf16: number): Promise<number>;
  sectionLengths(fileHash: string, count: number): Promise<number[]>;
}

type Reply = { id: number; result?: unknown; error?: string };
type WorkerLike = Pick<Worker, 'postMessage' | 'addEventListener'>;

export const createMarginsCore = (worker: WorkerLike): MarginsCore => {
  let nextId = 0;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  worker.addEventListener('message', (event: MessageEvent<Reply>) => {
    const request = pending.get(event.data.id);
    if (!request) return;
    pending.delete(event.data.id);
    if (event.data.error !== undefined) request.reject(new Error(event.data.error));
    else request.resolve(event.data.result);
  });
  worker.addEventListener('error', () => {
    for (const request of pending.values()) request.reject(new Error('margins core worker failed'));
    pending.clear();
  });

  const call =
    <A extends unknown[], R>(method: string) =>
    (...args: A) =>
      new Promise<R>((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
        worker.postMessage({ id, method, args });
      });

  return {
    loadBook: call('loadBook'),
    canonicalSection: call('canonicalSection'),
    fingerprint: call('fingerprint'),
    buildAnchor: call('buildAnchor'),
    resolve: call('resolve'),
    toRaw: call('toRaw'),
    fromRaw: call('fromRaw'),
    mapOffset: call('mapOffset'),
    sectionLengths: call('sectionLengths'),
  };
};

let shared: MarginsCore | null = null;

export const getMarginsCore = (): MarginsCore =>
  (shared ??= createMarginsCore(new Worker('/workers/margins-core.worker.js', { type: 'module' })));
