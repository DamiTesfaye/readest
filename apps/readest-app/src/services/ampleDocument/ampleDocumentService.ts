import { Command } from '@tauri-apps/plugin-shell';
import type { AppService } from '@/types/system';
import type { SystemSettings } from '@/types/settings';
import { getFilename } from '@/utils/path';

/**
 * Bridge to the external `ample-document` CLI (see the ample-document package).
 *
 * The CLI turns a source document into the canonical AmpleDocument model and an
 * EPUB 3 that foliate-js can open. Readest only ever shells out to it: the model
 * itself lives outside the app, so swapping or upgrading the pipeline needs no
 * client release.
 *
 * The command name is fixed because Tauri's shell scope validates on it (see
 * `src-tauri/capabilities/default.json`), so the binary has to be on PATH.
 */
export const AMPLE_DOCUMENT_COMMAND = 'ample-document';

/** Formats the prompt is offered for. Everything else imports as usual. */
export const AMPLE_DOCUMENT_ELIGIBLE_EXTENSIONS = ['pdf', 'epub', 'docx'] as const;

export interface AmpleDocumentOutputs {
  /** Absolute path of the generated EPUB. */
  epubPath: string;
  /** Absolute path of the generated AmpleDocument JSON. */
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
  /** `undefined` until probed; the probe runs at most once per session. */
  private probe: Promise<boolean> | null = null;

  /** Forget the cached probe — used by tests and after the user flips the setting. */
  reset() {
    this.probe = null;
  }

  /**
   * True when the prompt should be offered: desktop build, setting on, and the
   * CLI answers `--version`. Never throws; any failure means "not available".
   */
  async isAvailable({ appService, settings }: AmpleDocumentDeps): Promise<boolean> {
    if (!appService.isDesktopApp) return false;
    if (settings.ampleDocumentPromptEnabled === false) return false;
    this.probe ??= this.probeCommand();
    return this.probe;
  }

  private async probeCommand(): Promise<boolean> {
    try {
      const output = await Command.create(AMPLE_DOCUMENT_COMMAND, ['--version']).execute();
      return output.code === 0;
    } catch {
      return false;
    }
  }

  /**
   * Run the pipeline on `filePath`, writing into `outDir`, and return the paths of
   * the EPUB and the AmpleDocument JSON. Rejects with the CLI's stderr on failure.
   *
   * epubcheck is skipped here: it is a development-time gate that needs a JVM, and
   * the pipeline's own schema and integrity checks already gate the report.
   */
  async convert(filePath: string, outDir: string): Promise<AmpleDocumentOutputs> {
    const output = await Command.create(AMPLE_DOCUMENT_COMMAND, [
      'run',
      filePath,
      '--out',
      outDir,
      '--skip-epubcheck',
    ]).execute();
    if (output.code !== 0) {
      const detail = (output.stderr || output.stdout || '').trim().split('\n').slice(-3).join(' ');
      throw new Error(detail || `${AMPLE_DOCUMENT_COMMAND} exited with ${output.code}`);
    }
    const stem = stemOf(filePath);
    return {
      epubPath: `${outDir}/${stem}.epub`,
      jsonPath: `${outDir}/${stem}.ampledoc.json`,
    };
  }
}

export const ampleDocumentService = new AmpleDocumentService();
