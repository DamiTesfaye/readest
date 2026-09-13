'use client';

import clsx from 'clsx';
import ModalPortal from '@/components/ModalPortal';
import { useTranslation } from '@/hooks/useTranslation';

export type AmpleDocumentChoice = 'continue' | 'amp';

interface AmpleDocumentPromptDialogProps {
  open: boolean;
  /** Extension of the single eligible file, lower case and without the dot. */
  extension: string | null;
  /** True when the batch has more than one eligible file. */
  isBatch: boolean;
  onChoose: (choice: AmpleDocumentChoice) => void;
}

/**
 * Offered at import time when the `ample-document` CLI is available: keep the
 * file as it is, or run it through the pipeline and read the generated EPUB.
 * One prompt per import batch, never one per file.
 */
export default function AmpleDocumentPromptDialog({
  open,
  extension,
  isBatch,
  onChoose,
}: AmpleDocumentPromptDialogProps) {
  const _ = useTranslation();
  if (!open) return null;

  const continueLabel =
    isBatch || !extension
      ? _('Continue as original files')
      : _('Continue as .{{extension}}', { extension });

  return (
    <ModalPortal>
      {/* `open` keeps the buttons in the accessibility tree; daisyUI handles the visuals. */}
      <dialog className='modal modal-open' open aria-labelledby='ample-document-prompt-title'>
        <div
          className='bg-base-200 w-[min(320px,calc(100vw-2rem))] rounded-2xl px-6 py-7 shadow-xl'
          role='document'
        >
          <div className='flex flex-col items-center gap-1 text-center'>
            <h3
              id='ample-document-prompt-title'
              className='text-base-content text-base font-semibold tracking-tight'
            >
              {_('Turbocharge your Experience')}
            </h3>
            <p className='text-base-content/60 text-[13px]'>
              {_('Enhance this file for a better experience')}
            </p>
          </div>
          <div className='mt-6 flex flex-col gap-3'>
            <button
              className={clsx(
                'bg-base-300 text-base-content h-10 rounded-full text-sm font-medium',
                'transition-colors hover:brightness-95',
              )}
              onClick={() => onChoose('continue')}
            >
              {continueLabel}
            </button>
            <button
              className={clsx(
                'bg-base-100 text-base-content h-10 rounded-full text-sm font-medium',
                'transition-colors hover:brightness-95',
              )}
              onClick={() => onChoose('amp')}
            >
              {_('Open as .amp')}
            </button>
          </div>
        </div>
      </dialog>
    </ModalPortal>
  );
}
