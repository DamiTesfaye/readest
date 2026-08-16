'use client';

import type { DemoEntry } from '../types';

import { Bookmark, Highlighter, Languages, Settings, Type, Volume2 } from 'lucide-react';

import StickyProgressBar from '@/app/reader/components/StickyProgressBar';
import BookCover from '@/components/BookCover';
import { PageFooter } from '@/components/landing/PageFooter';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import ColorInput from '@/components/settings/color/ColorInput';
import SettingsRow from '@/components/settings/primitives/SettingsRow';
import TextEditor from '@/components/TextEditor';
import type { Book } from '@/types/book';

// Inline data-URI cover so the demo renders without a configured remote image host.
const MOCK_COVER_URL =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='200'%20height='300'%3E%3Crect%20width='200'%20height='300'%20fill='%234a3728'/%3E%3Crect%20x='8'%20y='8'%20width='184'%20height='284'%20fill='none'%20stroke='%23c9a86a'%20stroke-width='2'/%3E%3Ctext%20x='100'%20y='150'%20fill='%23f5e9d0'%20font-size='20'%20text-anchor='middle'%20font-family='serif'%3EThe%20Silent%3C/text%3E%3Ctext%20x='100'%20y='178'%20fill='%23f5e9d0'%20font-size='20'%20text-anchor='middle'%20font-family='serif'%3ELibrary%3C/text%3E%3C/svg%3E";

const MOCK_BOOK: Book = {
  hash: 'a1b2c3d4e5f6',
  format: 'EPUB',
  title: 'The Silent Library',
  author: 'Eleanor Whitfield',
  coverImageUrl: MOCK_COVER_URL,
  createdAt: Date.now() - 1000 * 60 * 60 * 24 * 30,
  updatedAt: Date.now() - 1000 * 60 * 60 * 24,
  progress: [128, 412],
  readingStatus: 'reading',
  primaryLanguage: 'en',
};

export const demos: DemoEntry[] = [
  {
    name: 'DictionaryPopup',
    sourcePath: 'app/reader/components/annotator/DictionaryPopup.tsx',
    status: 'used',
    node: <div className='text-xs opacity-60'>Needs runtime context — see source</div>,
    notes:
      'Renders inside an absolutely-positioned Popup and drives lookups through useDictionaryResults, which fetches dictionary providers at runtime. Mock a looked-up word like "ephemeral" with its definition, but a live render requires the reader/dictionary runtime.',
  },
  {
    name: 'StickyProgressBar',
    sourcePath: 'app/reader/components/StickyProgressBar.tsx',
    status: 'used',
    node: (
      <div className='w-64 px-2 py-6'>
        <StickyProgressBar fraction={0.31} tickFractions={[0.12, 0.28, 0.45, 0.61, 0.78, 0.9]} />
      </div>
    ),
  },
  {
    name: 'BookCover',
    sourcePath: 'components/BookCover.tsx',
    status: 'used',
    node: (
      <div className='h-48 w-32 overflow-hidden rounded-md shadow-md'>
        <BookCover book={MOCK_BOOK} mode='grid' coverFit='crop' showSpine />
      </div>
    ),
  },
  {
    name: 'PageFooter',
    sourcePath: 'components/landing/PageFooter.tsx',
    status: 'used',
    node: <PageFooter tagline='Read anything, anywhere — your library in your pocket.' />,
  },
  {
    name: 'Command',
    sourcePath: 'components/primitives/command.tsx',
    status: 'stale',
    node: (
      <div className='w-72 rounded-md border'>
        <Command>
          <CommandInput placeholder='Search the reader…' />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading='Reading'>
              <CommandItem>
                <Bookmark />
                <span>Add bookmark</span>
                <CommandShortcut>⌘B</CommandShortcut>
              </CommandItem>
              <CommandItem>
                <Highlighter />
                <span>Highlight selection</span>
                <CommandShortcut>⌘H</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading='Tools'>
              <CommandItem>
                <Languages />
                <span>Translate page</span>
              </CommandItem>
              <CommandItem>
                <Volume2 />
                <span>Read aloud</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    ),
    notes: 'Composed inline (no dialog) so the palette is visible without opening a portal.',
  },
  {
    name: 'Select',
    sourcePath: 'components/primitives/select.tsx',
    status: 'stale',
    node: (
      <Select defaultValue='serif'>
        <SelectTrigger className='w-56'>
          <SelectValue placeholder='Choose a font' />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Reading fonts</SelectLabel>
            <SelectItem value='serif'>Bitter (Serif)</SelectItem>
            <SelectItem value='sans'>Inter (Sans-serif)</SelectItem>
            <SelectItem value='mono'>JetBrains Mono</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Dyslexia-friendly</SelectLabel>
            <SelectItem value='dyslexic'>OpenDyslexic</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    ),
    notes:
      'Trigger is pre-populated via defaultValue; the content list opens in a portal on click.',
  },
  {
    name: 'ColorInput',
    sourcePath: 'components/settings/color/ColorInput.tsx',
    status: 'used',
    node: <ColorInput label='Highlight color' value='#8B5E3C' onChange={() => {}} />,
  },
  {
    name: 'SettingsRow',
    sourcePath: 'components/settings/primitives/SettingsRow.tsx',
    status: 'used',
    node: (
      <div className='bg-base-100 w-80 rounded-xl'>
        <SettingsRow
          label={
            <span className='flex items-center gap-2'>
              <Type className='h-4 w-4 opacity-70' />
              Font size
            </span>
          }
          description='Applies to all reflowable books'
        >
          <span className='text-base-content/70 text-sm'>18 px</span>
        </SettingsRow>
        <SettingsRow
          label={
            <span className='flex items-center gap-2'>
              <Settings className='h-4 w-4 opacity-70' />
              Tap to turn pages
            </span>
          }
        >
          <input type='checkbox' className='toggle toggle-sm' defaultChecked readOnly />
        </SettingsRow>
      </div>
    ),
  },
  {
    name: 'TextEditor',
    sourcePath: 'components/TextEditor.tsx',
    status: 'used',
    node: (
      <div className='bg-base-100 w-80 rounded-md border p-3'>
        <TextEditor
          value={'Chapter 3 — note: the lighthouse motif returns here, echoing page 47.'}
          onChange={() => {}}
          minRows={3}
          maxRows={6}
          placeholder='Add a note…'
        />
      </div>
    ),
  },
];
