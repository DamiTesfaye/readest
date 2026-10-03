'use client';

import clsx from 'clsx';
import ModalPortal from '@/components/ModalPortal';
import { useTranslation } from '@/hooks/useTranslation';

export type AmpleDocumentChoice = 'continue' | 'amp';

interface AmpleDocumentPromptDialogProps {
  open: boolean;
  extension: string | null;
  isBatch: boolean;
  onChoose: (choice: AmpleDocumentChoice) => void;
}

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
