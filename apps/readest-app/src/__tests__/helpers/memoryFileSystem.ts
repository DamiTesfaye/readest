import type { BaseDir, FileInfo, FileItem, FileSystem, ResolvedPath } from '@/types/system';

export class MemoryFileSystem implements FileSystem {
  readonly files = new Map<string, string>();
  readonly writes: string[] = [];

  private key(path: string, base: BaseDir): string {
    return `${base}:${path}`;
  }

  writesTo(path: string): number {
    return this.writes.filter((written) => written === path).length;
  }

  clearWrites(): void {
    this.writes.length = 0;
  }

  resolvePath(): ResolvedPath {
    throw new Error('MemoryFileSystem.resolvePath is not implemented');
  }

  getURL(): string {
    throw new Error('MemoryFileSystem.getURL is not implemented');
  }

  async getBlobURL(): Promise<string> {
    throw new Error('MemoryFileSystem.getBlobURL is not implemented');
  }

  async getImageURL(): Promise<string> {
    throw new Error('MemoryFileSystem.getImageURL is not implemented');
  }

  async openFile(): Promise<File> {
    throw new Error('MemoryFileSystem.openFile is not implemented');
  }

  async stats(): Promise<FileInfo> {
    throw new Error('MemoryFileSystem.stats is not implemented');
  }

  async copyFile(
    srcPath: string,
    srcBase: BaseDir,
    dstPath: string,
    dstBase: BaseDir,
  ): Promise<void> {
    const content = this.files.get(this.key(srcPath, srcBase));
    if (content === undefined) throw new Error(`missing file: ${srcPath}`);
    this.files.set(this.key(dstPath, dstBase), content);
  }

  async readFile(path: string, base: BaseDir): Promise<string> {
    const content = this.files.get(this.key(path, base));
    if (content === undefined) throw new Error(`missing file: ${path}`);
    return content;
  }

  async writeFile(
    path: string,
    base: BaseDir,
    content: string | ArrayBuffer | File,
  ): Promise<void> {
    if (typeof content !== 'string') throw new Error('MemoryFileSystem stores text only');
    this.writes.push(path);
    this.files.set(this.key(path, base), content);
  }

  async removeFile(path: string, base: BaseDir): Promise<void> {
    this.files.delete(this.key(path, base));
  }

  async readDir(path: string, base: BaseDir): Promise<FileItem[]> {
    const prefix = this.key(`${path}/`, base);
    return [...this.files.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, content]) => ({ path: key.slice(prefix.length), size: content.length }));
  }

  async createDir(): Promise<void> {}

  async removeDir(path: string, base: BaseDir): Promise<void> {
    const prefix = this.key(`${path}/`, base);
    for (const key of [...this.files.keys()]) {
      if (key.startsWith(prefix)) this.files.delete(key);
    }
  }

  async exists(path: string, base: BaseDir): Promise<boolean> {
    return this.files.has(this.key(path, base));
  }

  async getPrefix(): Promise<string> {
    return '';
  }
}
