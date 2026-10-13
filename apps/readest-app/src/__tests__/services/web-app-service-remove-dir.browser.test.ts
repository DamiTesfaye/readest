import { beforeEach, describe, expect, it } from 'vitest';
import { WebAppService } from '@/services/webAppService';

const clearStore = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open('AppFileSystem', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('files')) {
        request.result.createObjectStore('files', { keyPath: 'path' });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });

describe('WebAppService.deleteDir', () => {
  let service: WebAppService;

  beforeEach(async () => {
    await clearStore();
    service = new WebAppService();
    await service.init();
  });

  it('removes the directory, never a sibling whose name starts with the same text', async () => {
    await service.writeFile('b1/mindmaps/.trash/ab/ab.json', 'Books', 'a');
    await service.writeFile('b1/mindmaps/.trash/abc/abc.json', 'Books', 'b');
    await service.deleteDir('b1/mindmaps/.trash/ab', 'Books', true);
    expect(await service.exists('b1/mindmaps/.trash/ab/ab.json', 'Books')).toBe(false);
    expect(await service.exists('b1/mindmaps/.trash/abc/abc.json', 'Books')).toBe(true);
  });

  it('accepts a trailing slash', async () => {
    await service.writeFile('b1/mindmaps/m1/m1.json', 'Books', 'a');
    await service.deleteDir('b1/mindmaps/m1/', 'Books', true);
    expect(await service.exists('b1/mindmaps/m1/m1.json', 'Books')).toBe(false);
  });
});
