import { MemoryFileSystem } from '@/__tests__/helpers/memoryFileSystem';
import type { AppService } from '@/types/system';

export const memoryAppService = (fs: MemoryFileSystem = new MemoryFileSystem()): AppService =>
  ({
    isMobile: false,
    exists: fs.exists.bind(fs),
    readFile: fs.readFile.bind(fs),
    writeFile: fs.writeFile.bind(fs),
    copyFile: fs.copyFile.bind(fs),
    createDir: fs.createDir.bind(fs),
    readDirectory: fs.readDir.bind(fs),
    deleteDir: fs.removeDir.bind(fs),
  }) as unknown as AppService;
