'use client';

import { useState } from 'react';
import { FiBookmark, FiCopy, FiEdit3, FiTrash2, FiSearch } from 'react-icons/fi';

import type { DemoEntry } from '../types';

import AnnotationToolButton from '@/app/reader/components/annotator/AnnotationToolButton';
import EmptyState from '@/app/reader/components/EmptyState';
import { BrandHeader } from '@/components/landing/BrandHeader';
import { Button } from '@/components/primitives/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from '@/components/primitives/input-group';
import SegmentedControl from '@/components/SegmentedControl';
import SettingLabel from '@/components/settings/primitives/SettingLabel';
import Slider from '@/components/Slider';

const SegmentedControlDemo = () => {
  const [view, setView] = useState<'highlights' | 'notes' | 'bookmarks'>('highlights');
  return (
    <SegmentedControl<'highlights' | 'notes' | 'bookmarks'>
      ariaLabel='Annotation view'
      value={view}
      onChange={setView}
      options={[
        { value: 'highlights', label: 'Highlights' },
        { value: 'notes', label: 'Notes' },
        { value: 'bookmarks', label: 'Bookmarks' },
      ]}
    />
  );
};

const SliderDemo = () => (
  <div className='w-72'>
    <Slider
      label='Brightness'
      min={0}
      max={100}
      step={1}
      initialValue={68}
      minLabel='0%'
      maxLabel='100%'
      bubbleLabel='68%'
      onChange={() => {}}
    />
  </div>
);

export const demos: DemoEntry[] = [
  {
    name: 'AnnotationToolButton',
    sourcePath: 'app/reader/components/annotator/AnnotationToolButton.tsx',
    status: 'used',
    node: (
      <div className='flex items-center gap-2'>
        <AnnotationToolButton
          showTooltip
          tooltipText='Copy highlight'
          Icon={FiCopy}
          onClick={() => {}}
        />
        <AnnotationToolButton
          showTooltip
          tooltipText='Edit note'
          Icon={FiEdit3}
          onClick={() => {}}
        />
        <AnnotationToolButton
          showTooltip
          tooltipText='Delete annotation'
          disabled
          Icon={FiTrash2}
          onClick={() => {}}
        />
      </div>
    ),
  },
  {
    name: 'EmptyState',
    sourcePath: 'app/reader/components/EmptyState.tsx',
    status: 'used',
    node: (
      <EmptyState
        Icon={FiBookmark}
        label='No bookmarks yet'
        hint='Tap the bookmark icon while reading to save your place.'
        action={
          <Button variant='outline' size='sm' onClick={() => {}}>
            Start reading
          </Button>
        }
      />
    ),
  },
  {
    name: 'MarkdownText',
    sourcePath: 'components/assistant/MarkdownText.tsx',
    status: 'used',
    node: <div className='text-xs opacity-60'>Needs runtime context — see source</div>,
    notes:
      'MarkdownTextPrimitive reads the message part text from the assistant-ui runtime/message context; it cannot render standalone with mock props.',
  },
  {
    name: 'BrandHeader',
    sourcePath: 'components/landing/BrandHeader.tsx',
    status: 'used',
    node: (
      <BrandHeader
        title='Readest'
        subtitle='Your library, synced across every device.'
        alt='Readest logo'
      />
    ),
  },
  {
    name: 'Button',
    sourcePath: 'components/primitives/button.tsx',
    status: 'used',
    node: (
      <div className='flex flex-wrap items-center gap-3'>
        <Button onClick={() => {}}>Open book</Button>
        <Button variant='secondary' onClick={() => {}}>
          Add to shelf
        </Button>
        <Button variant='outline' onClick={() => {}}>
          Preview
        </Button>
        <Button variant='ghost' onClick={() => {}}>
          Mark as read
        </Button>
        <Button variant='destructive' onClick={() => {}}>
          Delete
        </Button>
        <Button variant='link' onClick={() => {}}>
          View details
        </Button>
        <Button size='sm' onClick={() => {}}>
          Small
        </Button>
        <Button size='lg' onClick={() => {}}>
          Large
        </Button>
      </div>
    ),
  },
  {
    name: 'InputGroup',
    sourcePath: 'components/primitives/input-group.tsx',
    status: 'stale',
    node: (
      <div className='w-80'>
        <InputGroup>
          <InputGroupAddon>
            <FiSearch />
          </InputGroupAddon>
          <InputGroupInput placeholder='Search your library…' defaultValue='The Name of the Wind' />
          <InputGroupAddon align='inline-end'>
            <InputGroupText>1,248 books</InputGroupText>
            <InputGroupButton size='sm' onClick={() => {}}>
              Search
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </div>
    ),
  },
  {
    name: 'SegmentedControl',
    sourcePath: 'components/SegmentedControl.tsx',
    status: 'used',
    node: <SegmentedControlDemo />,
  },
  {
    name: 'SettingLabel',
    sourcePath: 'components/settings/primitives/SettingLabel.tsx',
    status: 'used',
    node: (
      <div className='flex flex-col gap-2'>
        <SettingLabel>Page turning animation</SettingLabel>
        <SettingLabel as='label'>Default reading font</SettingLabel>
      </div>
    ),
  },
  {
    name: 'Slider',
    sourcePath: 'components/Slider.tsx',
    status: 'used',
    node: <SliderDemo />,
  },
];
