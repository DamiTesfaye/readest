import { Command } from '@tauri-apps/plugin-shell';
import type { AppService } from '@/types/system';
import type { SystemSettings } from '@/types/settings';
import { getFilename } from '@/utils/path';

export const AMPLE_DOCUMENT_VERSION_COMMAND = 'ample-document-version';
export const AMPLE_DOCUMENT_RUN_COMMAND = 'ample-document-run';

export const AMPLE_DOCUMENT_ELIGIBLE_EXTENSIONS = ['pdf', 'epub', 'docx'] as const;

export interface AmpleDocumentOutputs {
  epubPath: string;
  jsonPath: string;
}

export interface AmpleDocumentDeps {
  appService: AppService;
  settings: SystemSettings;
}

const extensionOf = (path: string) => {
  const name = getFilename(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
};

export const isEligibleForAmpleDocument = (path: string) =>
  (AMPLE_DOCUMENT_ELIGIBLE_EXTENSIONS as readonly string[]).includes(extensionOf(path));

const stemOf = (path: string) => {
  const name = getFilename(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
};

class AmpleDocumentService {
  private probe: Promise<boolean> | null = null;

  reset() {
    this.probe = null;
  }

  async isAvailable({ appService, settings }: AmpleDocumentDeps): Promise<boolean> {
    if (!appService.isDesktopApp) return false;
    if (settings.ampleDocumentPromptEnabled === false) return false;
    this.probe ??= this.probeCommand();
    return this.probe;
  }

  private async probeCommand(): Promise<boolean> {
    try {
      const output = await Command.create(AMPLE_DOCUMENT_VERSION_COMMAND, ['--version']).execute();
      return output.code === 0;
    } catch {
      return false;
    }
  }

  async convert(filePath: string, outDir: string): Promise<AmpleDocumentOutputs> {
    const output = await Command.create(AMPLE_DOCUMENT_RUN_COMMAND, [
      'run',
      filePath,
      '--out',
      outDir,
      '--skip-epubcheck',
    ]).execute();
    if (output.code !== 0) {
      const detail = (output.stderr || output.stdout || '').trim().split('\n').slice(-3).join(' ');
      throw new Error(detail || `ample-document exited with ${output.code}`);
    }
    const stem = stemOf(filePath);
    return {
      epubPath: `${outDir}/${stem}.epub`,
      jsonPath: `${outDir}/${stem}.ampledoc.json`,
    };
  }
}

export const ampleDocumentService = new AmpleDocumentService();
