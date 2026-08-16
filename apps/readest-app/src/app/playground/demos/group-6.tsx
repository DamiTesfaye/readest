'use client';

import { useState } from 'react';
import type { DemoEntry } from '../types';
import { MdPerson } from 'react-icons/md';

import { CachedImage } from '@/components/CachedImage';
import ModalPortal from '@/components/ModalPortal';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import BoxedList from '@/components/settings/primitives/BoxedList';
import SettingsSelect from '@/components/settings/primitives/SettingsSelect';
import TTSIcon from '@/app/reader/components/tts/TTSIcon';
import UserAvatar from '@/components/UserAvatar';

const bookCover =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='120' height='180'>" +
      "<rect width='120' height='180' fill='#4f46e5'/>" +
      "<text x='60' y='86' fill='white' font-size='13' text-anchor='middle' font-family='serif'>Moby</text>" +
      "<text x='60' y='104' fill='white' font-size='13' text-anchor='middle' font-family='serif'>Dick</text>" +
      '</svg>',
  );

// Overlay components portal a full-screen layer to document.body. In the
// playground we render them behind a click-trigger so they don't permanently
// blanket the page.
function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type='button' className='btn btn-primary btn-sm' onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reading goal reached</DialogTitle>
            <DialogDescription>
              You finished “The Great Gatsby” — that’s 12 books this year.
            </DialogDescription>
          </DialogHeader>
          <p className='text-muted-foreground text-sm'>
            Keep the streak going by starting your next book today.
          </p>
          <DialogFooter>
            <button type='button' className='btn btn-ghost btn-sm' onClick={() => setOpen(false)}>
              Maybe later
            </button>
            <button type='button' className='btn btn-primary btn-sm' onClick={() => setOpen(false)}>
              Pick next book
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModalPortalDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type='button' className='btn btn-sm' onClick={() => setOpen(true)}>
        Show modal
      </button>
      {open ? (
        <ModalPortal>
          <div className='bg-base-100 rounded-lg p-6 shadow-xl'>
            <p className='text-sm font-medium'>Delete “Pride and Prejudice” from your library?</p>
            <p className='text-base-content/60 mt-1 text-xs'>This cannot be undone.</p>
            <div className='mt-4 flex justify-end gap-2'>
              <button type='button' className='btn btn-ghost btn-sm' onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type='button' className='btn btn-error btn-sm' onClick={() => setOpen(false)}>
                Delete
              </button>
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </>
  );
}

export const demos: DemoEntry[] = [
  {
    name: 'DictionarySheet',
    sourcePath: 'app/reader/components/annotator/DictionarySheet.tsx',
    status: 'used',
    node: <div className='text-xs opacity-60'>Needs runtime context — see source</div>,
    notes:
      'Wraps useDictionaryResults, which depends on EnvContext, the theme/custom-dictionary Zustand stores, and Tauri opener — none mockable from the playground. Renders a 0.75 snap-height bottom sheet showing a word and its definitions.',
  },
  {
    name: 'TTSIcon',
    sourcePath: 'app/reader/components/tts/TTSIcon.tsx',
    status: 'used',
    node: (
      <div className='h-12 w-12'>
        <TTSIcon isPlaying ttsInited onClick={() => {}} />
      </div>
    ),
    notes:
      'Sized by its parent (h-full/w-full); animated equalizer bars play while isPlaying is true.',
  },
  {
    name: 'CachedImage',
    sourcePath: 'components/CachedImage.tsx',
    status: 'used',
    node: (
      <CachedImage
        src={bookCover}
        alt='Moby Dick cover'
        width={120}
        height={180}
        className='rounded-md shadow'
        onGenerateCachedImageUrl={(url) => Promise.resolve(url)}
      />
    ),
    notes:
      'onGenerateCachedImageUrl normally resolves a Tauri/asset URL; here it echoes a data-URI cover. Renders via next/image.',
  },
  {
    name: 'ModalPortal',
    sourcePath: 'components/ModalPortal.tsx',
    status: 'used',
    node: <ModalPortalDemo />,
    notes:
      'Click to open. Portals a fixed full-screen overlay (z-120) to document.body — not inline at this card.',
  },
  {
    name: 'Dialog',
    sourcePath: 'components/primitives/dialog.tsx',
    status: 'used',
    node: <DialogDemo />,
    notes:
      'Click to open. Radix Dialog — DialogContent portals to document.body with a full-screen overlay.',
  },
  {
    name: 'Separator',
    sourcePath: 'components/primitives/separator.tsx',
    status: 'used',
    node: (
      <div className='w-64 text-sm'>
        <p className='py-1'>Chapter 1 — Loomings</p>
        <Separator className='my-2' />
        <p className='py-1'>Chapter 2 — The Carpet-Bag</p>
      </div>
    ),
  },
  {
    name: 'BoxedList',
    sourcePath: 'components/settings/primitives/BoxedList.tsx',
    status: 'used',
    node: (
      <div className='w-72'>
        <BoxedList title='Reading' description='Applies to all books in your library.'>
          <div className='flex items-center justify-between py-3 pe-4'>
            <span className='text-sm'>Font size</span>
            <span className='text-base-content/60 text-sm'>18 px</span>
          </div>
          <div className='flex items-center justify-between py-3 pe-4'>
            <span className='text-sm'>Line spacing</span>
            <span className='text-base-content/60 text-sm'>1.5</span>
          </div>
          <div className='flex items-center justify-between py-3 pe-4'>
            <span className='text-sm'>Margins</span>
            <span className='text-base-content/60 text-sm'>Medium</span>
          </div>
        </BoxedList>
      </div>
    ),
  },
  {
    name: 'SettingsSelect',
    sourcePath: 'components/settings/primitives/SettingsSelect.tsx',
    status: 'used',
    node: (
      <div className='bg-base-100 flex w-72 items-center justify-between rounded-md px-4 py-2'>
        <span className='text-sm'>Theme</span>
        <SettingsSelect
          value='sepia'
          onChange={() => {}}
          ariaLabel='Reader theme'
          options={[
            { value: 'light', label: 'Light' },
            { value: 'sepia', label: 'Sepia' },
            { value: 'dark', label: 'Dark' },
            { value: 'eink', label: 'E-ink' },
          ]}
        />
      </div>
    ),
  },
  {
    name: 'UserAvatar',
    sourcePath: 'components/UserAvatar.tsx',
    status: 'used',
    node: (
      <div className='flex items-center gap-3'>
        <div className='bg-neutral text-neutral-content rounded-full'>
          <UserAvatar url='' size={40} DefaultIcon={MdPerson} />
        </div>
        <span className='text-sm font-medium'>Ishmael Q.</span>
      </div>
    ),
    notes:
      'With a real url it loads via next/image and caches the avatar as base64 in localStorage; passing url="" renders the DefaultIcon fallback so no remote host config is needed.',
  },
];
