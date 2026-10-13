'use client';

import { FiChevronDown, FiCopy, FiVolume2 } from 'react-icons/fi';
import type { DemoEntry } from '../types';

import { annotationToolButtons } from '@/app/reader/components/annotator/AnnotationTools';
import StatusInfo from '@/app/reader/components/StatusInfo';
import { TooltipIconButton } from '@/components/assistant/TooltipIconButton';
import { Card } from '@/components/landing/Card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/primitives/collapsible';
import { Input } from '@/components/primitives/input';
import Select from '@/components/Select';
import SettingsInput from '@/components/settings/primitives/SettingsInput';
import TextButton from '@/components/TextButton';

export const demos: DemoEntry[] = [
  {
    name: 'AnnotationTools',
    sourcePath: 'app/reader/components/annotator/AnnotationTools.tsx',
    status: 'used',
    notes:
      'Config/data module (not a component): exports annotationToolButtons & annotationToolQuickActions. Rendered below as icon chips mapped from the data.',
    node: (
      <div className='flex flex-wrap gap-2'>
        {annotationToolButtons.map(({ type, label, Icon, quickAction }) => (
          <div
            key={type}
            className='border-base-300 bg-base-200 flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs'
          >
            <Icon className='size-3.5' />
            <span>{label}</span>
            {quickAction && <span className='text-[9px] opacity-50'>quick</span>}
          </div>
        ))}
      </div>
    ),
  },
  {
    name: 'StatusInfo',
    sourcePath: 'app/reader/components/StatusInfo.tsx',
    status: 'used',
    notes:
      'Reader footer status bar — shows live clock and battery gauge (battery hidden when the Battery API is unavailable).',
    node: <StatusInfo showTime showBattery showBatteryPercentage use24Hour={false} />,
  },
  {
    name: 'TooltipIconButton',
    sourcePath: 'components/assistant/TooltipIconButton.tsx',
    status: 'used',
    node: (
      <TooltipIconButton tooltip='Read aloud this passage' side='bottom'>
        <FiVolume2 />
      </TooltipIconButton>
    ),
  },
  {
    name: 'Card',
    sourcePath: 'components/landing/Card.tsx',
    status: 'used',
    node: (
      <Card>
        <h2 className='mb-2 text-lg font-semibold'>Highlight shared with you</h2>
        <p className='text-base-content/70 text-sm'>
          &ldquo;It was the best of times, it was the worst of times.&rdquo; — A Tale of Two Cities,
          Charles Dickens
        </p>
      </Card>
    ),
  },
  {
    name: 'Collapsible',
    sourcePath: 'components/primitives/collapsible.tsx',
    status: 'stale',
    node: (
      <Collapsible defaultOpen className='border-base-300 w-72 rounded-md border p-3'>
        <CollapsibleTrigger className='flex w-full items-center justify-between text-sm font-medium'>
          Chapter 3 — Notes
          <FiChevronDown className='size-4' />
        </CollapsibleTrigger>
        <CollapsibleContent className='text-base-content/70 mt-2 space-y-1 text-xs'>
          <p>Page 42 — &ldquo;the mariner&rsquo;s tale begins&rdquo;</p>
          <p>Page 47 — bookmark on the storm passage</p>
        </CollapsibleContent>
      </Collapsible>
    ),
  },
  {
    name: 'Input',
    sourcePath: 'components/primitives/input.tsx',
    status: 'used',
    node: (
      <Input type='search' placeholder='Search in book…' defaultValue='whale' className='w-64' />
    ),
  },
  {
    name: 'Select',
    sourcePath: 'components/Select.tsx',
    status: 'used',
    node: (
      <Select
        value='serif'
        onChange={() => {}}
        options={[
          { value: 'serif', label: 'Bitter (Serif)' },
          { value: 'sans', label: 'Roboto (Sans)' },
          { value: 'mono', label: 'Fira Code (Mono)' },
          { value: 'dyslexic', label: 'OpenDyslexic', disabled: true },
        ]}
      />
    ),
  },
  {
    name: 'SettingsInput',
    sourcePath: 'components/settings/primitives/SettingsInput.tsx',
    status: 'used',
    node: (
      <div className='border-base-300 bg-base-100 flex w-72 items-center justify-between rounded-md border px-3'>
        <span className='text-sm'>Line height</span>
        <SettingsInput type='number' defaultValue={1.6} step={0.1} min={1} max={3} />
      </div>
    ),
  },
  {
    name: 'TextButton',
    sourcePath: 'components/TextButton.tsx',
    status: 'used',
    node: (
      <div className='flex items-center gap-4'>
        <TextButton variant='primary' onClick={() => {}}>
          Add note
        </TextButton>
        <TextButton variant='danger' onClick={() => {}}>
          Delete highlight
        </TextButton>
        <TextButton variant='secondary' size='md' disabled onClick={() => {}}>
          <FiCopy className='mr-1 inline size-3.5' />
          Copy
        </TextButton>
      </div>
    ),
  },
];
