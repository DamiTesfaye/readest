import type { AppService, FileSystem } from '@/types/system';

export type MindmapFs = Pick<
  FileSystem,
  'exists' | 'readFile' | 'writeFile' | 'copyFile' | 'createDir' | 'readDir' | 'removeDir'
>;

export const mindmapFsFromAppService = (service: AppService): MindmapFs => ({
  exists: (path, base) => service.exists(path, base),
  readFile: (path, base, mode) => service.readFile(path, base, mode),
  writeFile: (path, base, content) => service.writeFile(path, base, content),
  copyFile: (srcPath, srcBase, dstPath, dstBase) =>
    service.copyFile(srcPath, srcBase, dstPath, dstBase),
  createDir: (path, base, recursive) => service.createDir(path, base, recursive),
  readDir: (path, base) => service.readDirectory(path, base),
  removeDir: (path, base, recursive) => service.deleteDir(path, base, recursive),
});
