import { describe, it, expect, vi, beforeEach } from 'vitest';

const execute = vi.fn();
vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: { create: vi.fn((_name: string, args: string[]) => ({ execute: () => execute(args) })) },
}));

import { Command } from '@tauri-apps/plugin-shell';
import {
  ampleDocumentService,
  isEligibleForAmpleDocument,
} from '@/services/ampleDocument/ampleDocumentService';
import type { AppService } from '@/types/system';
import type { SystemSettings } from '@/types/settings';

const deps = (overrides: { isDesktopApp?: boolean; enabled?: boolean } = {}) => ({
  appService: { isDesktopApp: overrides.isDesktopApp ?? true } as AppService,
  settings: { ampleDocumentPromptEnabled: overrides.enabled ?? true } as SystemSettings,
});

beforeEach(() => {
  execute.mockReset();
  vi.mocked(Command.create).mockClear();
  ampleDocumentService.reset();
});

describe('isEligibleForAmpleDocument', () => {
  it('accepts the formats the pipeline improves and rejects the rest', () => {
    expect(isEligibleForAmpleDocument('/books/a.pdf')).toBe(true);
    expect(isEligibleForAmpleDocument('/books/a.EPUB')).toBe(true);
    expect(isEligibleForAmpleDocument('/books/a.docx')).toBe(true);
    expect(isEligibleForAmpleDocument('/books/a.txt')).toBe(false);
    expect(isEligibleForAmpleDocument('/books/noextension')).toBe(false);
  });
});

describe('ampleDocumentService.isAvailable', () => {
  it('is false off the desktop build, without ever probing', async () => {
    expect(await ampleDocumentService.isAvailable(deps({ isDesktopApp: false }))).toBe(false);
    expect(Command.create).not.toHaveBeenCalled();
  });

  it('is false when the user turned the prompt off', async () => {
    expect(await ampleDocumentService.isAvailable(deps({ enabled: false }))).toBe(false);
    expect(Command.create).not.toHaveBeenCalled();
  });

  it('is true when the CLI answers --version, and probes only once', async () => {
    execute.mockResolvedValue({ code: 0, stdout: 'ample-document 0.1.0', stderr: '' });
    expect(await ampleDocumentService.isAvailable(deps())).toBe(true);
    expect(await ampleDocumentService.isAvailable(deps())).toBe(true);
    expect(Command.create).toHaveBeenCalledTimes(1);
    expect(vi.mocked(Command.create).mock.calls[0]).toEqual([
      'ample-document-version',
      ['--version'],
    ]);
  });

  it('is false when the command is missing or exits non-zero', async () => {
    execute.mockRejectedValueOnce(new Error('program not found'));
    expect(await ampleDocumentService.isAvailable(deps())).toBe(false);

    ampleDocumentService.reset();
    execute.mockResolvedValueOnce({ code: 127, stdout: '', stderr: 'not found' });
    expect(await ampleDocumentService.isAvailable(deps())).toBe(false);
  });
});

describe('ampleDocumentService.convert', () => {
  it('runs the pipeline and returns the EPUB and JSON paths', async () => {
    execute.mockResolvedValue({ code: 0, stdout: 'ok   book.pdf: pymupdf', stderr: '' });
    const outputs = await ampleDocumentService.convert('/books/My Book.pdf', '/tmp/out');
    expect(vi.mocked(Command.create).mock.calls[0]).toEqual([
      'ample-document-run',
      ['run', '/books/My Book.pdf', '--out', '/tmp/out', '--skip-epubcheck'],
    ]);
    expect(outputs).toEqual({
      epubPath: '/tmp/out/My Book.epub',
      jsonPath: '/tmp/out/My Book.ampledoc.json',
    });
  });

  it('rejects with the CLI output when the run fails', async () => {
    execute.mockResolvedValue({ code: 1, stdout: '', stderr: 'FAIL book.pdf: truncated' });
    await expect(ampleDocumentService.convert('/books/book.pdf', '/tmp/out')).rejects.toThrow(
      /truncated/,
    );
  });
});
