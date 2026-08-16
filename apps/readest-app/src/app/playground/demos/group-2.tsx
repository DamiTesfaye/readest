'use client';
import type { DemoEntry } from '../types';
import type { BookNote, HighlightColor, HighlightStyle } from '@/types/book';
import type { Position } from '@/utils/sel';
import type { Insets } from '@/types/misc';
import type { QuotaType } from '@/types/quota';

import AnnotationPopup from '@/app/reader/components/annotator/AnnotationPopup';
import DoubleBorder from '@/app/reader/components/DoubleBorder';
import UsageStats from '@/app/user/components/UsageStats';
import { HighlighterIcon } from '@/components/HighlighterIcon';
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from '@/components/ui/button-group';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import SectionTitle from '@/components/settings/primitives/SectionTitle';
import SubPageHeader from '@/components/settings/SubPageHeader';

const noop = () => {};

const annotationPosition: Position = { point: { x: 120, y: 80 }, dir: 'down' };
const annotationTrianglePosition: Position = { point: { x: 120, y: 8 }, dir: 'up' };
const annotationNotes: BookNote[] = [];
const selectedStyle: HighlightStyle = 'highlight';
const selectedColor: HighlightColor = 'yellow';

const readerInsets: Insets = { top: 44, bottom: 44, left: 24, right: 24 };

const usageQuotas: QuotaType[] = [
  { name: 'Cloud Storage', tooltip: 'Synced book files', used: 320, total: 1024, unit: 'MB' },
  {
    name: 'Daily Translation',
    tooltip: 'Characters translated today',
    used: 7400,
    total: 20000,
    unit: 'chars',
    resetAt: Date.now() + 1000 * 60 * 60 * 6,
  },
];

export const demos: DemoEntry[] = [
  {
    name: 'AnnotationPopup',
    sourcePath: 'app/reader/components/annotator/AnnotationPopup.tsx',
    status: 'used',
    node: (
      <div className='relative h-[520px] w-80'>
        <AnnotationPopup
          bookKey='the-hobbit-2024'
          dir='ltr'
          isVertical={false}
          selectedText='astonished'
          notes={annotationNotes}
          position={annotationPosition}
          trianglePosition={annotationTrianglePosition}
          selectedStyle={selectedStyle}
          selectedColor={selectedColor}
          annotatedStyle={null}
          popupWidth={240}
          popupHeight={460}
          canShare
          onSelectStyle={noop}
          onSelectColor={noop}
          onBookmark={noop}
          onAddNote={noop}
          onLookup={noop}
          onTranslate={noop}
          onSearch={noop}
          onCopy={noop}
          onShare={noop}
          onDismiss={noop}
        />
      </div>
    ),
    notes:
      'Sectioned selection popup over a passage: style icons crossfade to the selected color, five color dots, then bookmark/note, lookup/translate, and search/copy/share rows.',
  },
  {
    name: 'DoubleBorder',
    sourcePath: 'app/reader/components/DoubleBorder.tsx',
    status: 'used',
    node: (
      <div className='relative h-56 w-80 bg-amber-50'>
        <DoubleBorder
          borderColor='#8b5e34'
          horizontalGap={12}
          showHeader
          showFooter
          insets={readerInsets}
        />
      </div>
    ),
    notes: 'Decorative reading-page frame; positioned absolutely inside a relative sized box.',
  },
  {
    name: 'UsageStats',
    sourcePath: 'app/user/components/UsageStats.tsx',
    status: 'used',
    node: (
      <div className='w-80'>
        <UsageStats quotas={usageQuotas} />
      </div>
    ),
  },
  {
    name: 'HighlighterIcon',
    sourcePath: 'components/HighlighterIcon.tsx',
    status: 'used',
    node: <HighlighterIcon size={40} tipColor='#34d399' className='text-stone-700' />,
  },
  {
    name: 'ButtonGroup',
    sourcePath: 'components/primitives/button-group.tsx',
    status: 'stale',
    node: (
      <ButtonGroup>
        <button type='button' className='border-input rounded-md border px-3 py-1.5 text-sm'>
          Prev page
        </button>
        <ButtonGroupSeparator />
        <button type='button' className='border-input rounded-md border px-3 py-1.5 text-sm'>
          Next page
        </button>
        <ButtonGroupText>p. 128 / 412</ButtonGroupText>
      </ButtonGroup>
    ),
  },
  {
    name: 'HoverCard',
    sourcePath: 'components/primitives/hover-card.tsx',
    status: 'stale',
    node: (
      <HoverCard open>
        <HoverCardTrigger className='cursor-default underline decoration-dotted'>
          Brandon Sanderson
        </HoverCardTrigger>
        <HoverCardContent>
          <div className='space-y-1'>
            <p className='text-sm font-semibold'>Brandon Sanderson</p>
            <p className='text-xs opacity-70'>
              Author of The Stormlight Archive and Mistborn. 24 books in your library.
            </p>
          </div>
        </HoverCardContent>
      </HoverCard>
    ),
    notes: 'Rendered always-open so the card is visible without hovering.',
  },
  {
    name: 'Tooltip',
    sourcePath: 'components/primitives/tooltip.tsx',
    status: 'used',
    node: (
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger className='border-input rounded-md border px-3 py-1.5 text-sm'>
            Add bookmark
          </TooltipTrigger>
          <TooltipContent>Bookmark this page</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ),
    notes:
      'TooltipContent renders in a portal, so it appears outside this card. Shown always-open.',
  },
  {
    name: 'SectionTitle',
    sourcePath: 'components/settings/primitives/SectionTitle.tsx',
    status: 'used',
    node: <SectionTitle>Reading Sync</SectionTitle>,
  },
  {
    name: 'SubPageHeader',
    sourcePath: 'components/settings/SubPageHeader.tsx',
    status: 'used',
    node: (
      <div className='w-80'>
        <SubPageHeader
          parentLabel='Integrations'
          currentLabel='Dictionaries'
          description='Choose which dictionary providers are queried when you look up a word.'
          onBack={noop}
        />
      </div>
    ),
  },
];
