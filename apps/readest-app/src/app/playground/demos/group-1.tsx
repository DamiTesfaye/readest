'use client';
import type { DemoEntry } from '../types';

import { MdCloudSync } from 'react-icons/md';

import StatusBadge from '@/app/library/components/StatusBadge';
import BrightnessOverlay from '@/app/reader/components/BrightnessOverlay';
import PlanIndicators from '@/app/user/components/PlanIndicators';
import type { PlanDetails } from '@/app/user/utils/plan';
import HighlightChars from '@/components/command-palette/HighlightChars';
import { Overlay } from '@/components/Overlay';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from '@/components/primitives/dropdown-menu';
import { Textarea } from '@/components/primitives/textarea';
import NavigationRow from '@/components/settings/primitives/NavigationRow';
import SettingsSwitchRow from '@/components/settings/primitives/SettingsSwitchRow';

const noop = () => {};

const mockPlans: PlanDetails[] = [
  {
    name: 'Free',
    plan: 'free',
    type: 'subscription',
    color: '#64748b',
    hintColor: '#94a3b8',
    price: 0,
    currency: 'usd',
    interval: 'month',
    features: [{ label: '3 books in your library' }, { label: 'Basic sync' }],
  },
  {
    name: 'Plus',
    plan: 'plus',
    type: 'subscription',
    color: '#3b82f6',
    hintColor: '#60a5fa',
    price: 499,
    currency: 'usd',
    interval: 'month',
    features: [{ label: 'Unlimited library' }, { label: 'AI translation' }],
  },
  {
    name: 'Pro',
    plan: 'pro',
    type: 'subscription',
    color: '#7c3aed',
    hintColor: '#a78bfa',
    price: 999,
    currency: 'usd',
    interval: 'month',
    features: [{ label: 'Everything in Plus' }, { label: 'Priority TTS voices' }],
  },
];

export const demos: DemoEntry[] = [
  {
    name: 'StatusBadge',
    sourcePath: 'app/library/components/StatusBadge.tsx',
    status: 'used',
    node: (
      <div className='flex items-center gap-2'>
        <StatusBadge status='finished'>Finished</StatusBadge>
        <StatusBadge status='unread'>Unread</StatusBadge>
        <StatusBadge status='abandoned'>On hold</StatusBadge>
      </div>
    ),
  },
  {
    name: 'BrightnessOverlay',
    sourcePath: 'app/reader/components/BrightnessOverlay.tsx',
    status: 'used',
    node: (
      <div className='bg-base-300 relative h-56 w-40 overflow-hidden rounded-lg'>
        <BrightnessOverlay visible level={0.62} />
      </div>
    ),
    notes:
      'Positioned absolutely at the left edge; wrapped in a relative sized box so the capsule is visible.',
  },
  {
    name: 'PlanIndicators',
    sourcePath: 'app/user/components/PlanIndicators.tsx',
    status: 'used',
    node: <PlanIndicators allPlans={mockPlans} currentPlanIndex={1} onSelectPlan={noop} />,
  },
  {
    name: 'HighlightChars',
    sourcePath: 'components/command-palette/HighlightChars.tsx',
    status: 'used',
    node: (
      <div className='text-base-content text-sm'>
        <HighlightChars str='The Great Gatsby' indices={new Set([4, 5, 6, 7, 8])} />
      </div>
    ),
    notes: 'Fuzzy-match highlighter; indices mark the matched character positions in a book title.',
  },
  {
    name: 'Overlay',
    sourcePath: 'components/Overlay.tsx',
    status: 'used',
    node: (
      <div className='relative h-32 w-full overflow-hidden rounded-lg border'>
        <div className='text-base-content/70 p-3 text-xs'>
          Reader content behind a dismiss overlay
        </div>
        <Overlay onDismiss={noop} className='bg-base-content/10 !absolute' />
      </div>
    ),
    notes:
      'Normally fixed inset-0 (full screen). Scoped to !absolute inside a relative box for the demo.',
  },
  {
    name: 'DropdownMenu',
    sourcePath: 'components/primitives/dropdown-menu.tsx',
    status: 'used',
    node: (
      <DropdownMenu open modal={false}>
        <DropdownMenuTrigger className='border-input rounded-md border px-3 py-1.5 text-sm'>
          Book actions
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start'>
          <DropdownMenuLabel>The Great Gatsby</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            Continue reading
            <DropdownMenuShortcut>⌘R</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>Add to collection</DropdownMenuItem>
          <DropdownMenuCheckboxItem checked>Mark as finished</DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className='text-red-500'>Remove from library</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    notes:
      'Rendered always-open via the `open` prop. Content renders in a Radix portal, so it appears anchored to the trigger but outside the demo card DOM.',
  },
  {
    name: 'Textarea',
    sourcePath: 'components/primitives/textarea.tsx',
    status: 'used',
    node: (
      <Textarea
        className='w-72'
        defaultValue='This passage about the green light at the end of the dock stayed with me.'
        placeholder='Add a note to your highlight…'
      />
    ),
  },
  {
    name: 'NavigationRow',
    sourcePath: 'components/settings/primitives/NavigationRow.tsx',
    status: 'used',
    node: (
      <div className='bg-base-100 w-80 rounded-lg ps-4'>
        <NavigationRow
          icon={MdCloudSync}
          title='Readwise'
          status='Connected as reader@example.com'
          onClick={noop}
        />
      </div>
    ),
  },
  {
    name: 'SettingsSwitchRow',
    sourcePath: 'components/settings/primitives/SettingsSwitchRow.tsx',
    status: 'used',
    node: (
      <div className='bg-base-100 w-80 rounded-lg ps-4'>
        <SettingsSwitchRow
          label='Continuous scroll'
          description='Flip pages by scrolling instead of tapping'
          checked
          onChange={noop}
        />
      </div>
    ),
  },
];
