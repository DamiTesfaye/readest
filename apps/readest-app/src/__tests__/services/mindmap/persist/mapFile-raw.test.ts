import { describe, expect, it } from 'vitest';
import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import { mapFilePath, readRawMapText } from '@/services/mindmap/persist/mapFile';

describe('readRawMapText', () => {
  it('returns the main file as it is on disk, even when it cannot be parsed', async () => {
    const fs = new MemoryFileSystem();
    await fs.writeFile(mapFilePath('b1', 'm1'), 'Books', '{"broken');
    await fs.writeFile(`${mapFilePath('b1', 'm1')}.bak`, 'Books', 'older');
    expect(await readRawMapText(fs, 'b1', 'm1')).toBe('{"broken');
  });

  it('falls back to the backup, then to the copy moved aside as unreadable, then to nothing', async () => {
    const fs = new MemoryFileSystem();
    expect(await readRawMapText(fs, 'b1', 'm1')).toBeNull();
    await fs.writeFile(`${mapFilePath('b1', 'm1')}.unreadable`, 'Books', 'set aside');
    expect(await readRawMapText(fs, 'b1', 'm1')).toBe('set aside');
    await fs.writeFile(`${mapFilePath('b1', 'm1')}.bak`, 'Books', 'older');
    expect(await readRawMapText(fs, 'b1', 'm1')).toBe('older');
  });
});
