import { describe, expect, it, vi } from 'vitest';
import type { AppService } from '@/types/system';
import { mindmapFsFromAppService } from '@/services/mindmap/persist/mindmapFs';

describe('mindmapFsFromAppService', () => {
  it('maps readDir and removeDir onto the app service names and delegates the rest', async () => {
    const service = {
      exists: vi.fn(async () => true),
      readFile: vi.fn(async () => 'text'),
      writeFile: vi.fn(async () => {}),
      copyFile: vi.fn(async () => {}),
      createDir: vi.fn(async () => {}),
      readDirectory: vi.fn(async () => [{ path: 'm1/m1.json', size: 2 }]),
      deleteDir: vi.fn(async () => {}),
      deleteFile: vi.fn(async () => {}),
    };
    const fs = mindmapFsFromAppService(service as unknown as AppService);

    expect(await fs.readDir('b1/mindmaps', 'Books')).toEqual([{ path: 'm1/m1.json', size: 2 }]);
    await fs.removeDir('b1/mindmaps/m1', 'Books', true);
    expect(await fs.readFile('a', 'Books', 'text')).toBe('text');
    await fs.copyFile('a', 'Books', 'b', 'Books');

    expect(service.readDirectory).toHaveBeenCalledWith('b1/mindmaps', 'Books');
    expect(service.deleteDir).toHaveBeenCalledWith('b1/mindmaps/m1', 'Books', true);
    expect(service.copyFile).toHaveBeenCalledWith('a', 'Books', 'b', 'Books');
  });

  it('maps removeFile onto deleteFile', async () => {
    const service = { deleteFile: vi.fn(async () => {}) };
    await mindmapFsFromAppService(service as unknown as AppService).removeFile('a', 'Books');
    expect(service.deleteFile).toHaveBeenCalledWith('a', 'Books');
  });
});
