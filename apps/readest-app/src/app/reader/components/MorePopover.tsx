import clsx from 'clsx';
import React, { useEffect, useState } from 'react';

import { useThemeStore } from '@/store/themeStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import ToolbarPopover from '@/components/ToolbarPopover';
import PopoverTitleBar from '@/components/PopoverTitleBar';
import TextInMotionArt from '@/components/motionrive/TextInMotionArt';
import SparkTileArt from '@/components/sparkrive/SparkTileArt';
import LibraryArt from '@/components/moreart/LibraryArt';
import ContentsArt from '@/components/moreart/ContentsArt';
import ThemeFontsArt from '@/components/moreart/ThemeFontsArt';
import AnnotationsCupArt from '@/components/moreart/AnnotationsCupArt';
import BookmarksNotesArt from '@/components/moreart/BookmarksNotesArt';
import ReadingRulerArt from '@/components/moreart/ReadingRulerArt';
import HomeArt from '@/components/moreart/HomeArt';
import { getAppSessionSeed, getHomeRowVariant } from '@/utils/homeRowVariant';
import { isColoredIconTheme } from '@/utils/toolbarIcons';
import { QUICK_PICK_DRAG_TYPE, normalizeQuickPicks, type QuickPickId } from '@/utils/quickPicks';
import type { Rect } from '@/utils/sel';
import { useMoreActions, type MoreAction } from '../hooks/useMoreActions';

export const MORE_POPOVER_WIDTH = 300;

interface MorePopoverProps {
  bookKey: string;
  isOpen: boolean;
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onGoHome: () => void;
  onOpenLibrary: () => void;
  onOpenContents: () => void;
  onOpenThemeFonts: (anchorRect: Rect) => void;
  onOpenBooknotes: (anchorRect: Rect) => void;
  onOpenAnnotations: (anchorRect: Rect) => void;
  onToggleTTS: () => void;
  isArranging?: boolean;
  onArrangeChange?: (isArranging: boolean) => void;
}

const ROW_CLASS =
  'hover:bg-base-300 flex w-full items-center gap-2 rounded-lg px-2 py-1 text-start transition-colors';
const ART_CLASS = 'flex h-12 w-12 shrink-0 items-center justify-center';
const CAPTION_CLASS = 'popover-action-label text-base-content text-xs';
const SUBTITLE_CLASS = 'popover-label text-base-content/60 text-xxs leading-tight';
const SECTION_LABEL_CLASS = 'popover-label text-base-content/60';
const OPEN_STAGGER_MS = 150;
const TOOL_ART_CLASS = 'h-8 max-w-12';
const WOBBLE_STAGGER_S = 0.09;
const SWITCH_ON_SRC: Partial<Record<QuickPickId, string>> = {
  'moving-pictures': '/images/toolbar/switch-on-purple.svg',
  ruler: '/images/toolbar/switch-on-yellow.svg',
};
const SWITCH_OFF_SRC = '/images/toolbar/switch-off.svg';

const SPARK_ICONS: ReadonlySet<QuickPickId> = new Set([
  'margins',
  'mindmap',
  'discuss',
  'summarise',
  'tts',
  'mood-modes',
]);

const MorePopover: React.FC<MorePopoverProps> = ({
  bookKey,
  isOpen,
  anchorEl,
  onClose,
  onGoHome,
  onOpenLibrary,
  onOpenContents,
  onOpenThemeFonts,
  onOpenBooknotes,
  onOpenAnnotations,
  onToggleTTS,
  isArranging = false,
  onArrangeChange,
}) => {
  const _ = useTranslation();
  const { themeColor, isDarkMode } = useThemeStore();
  const { settings } = useSettingsStore();

  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const colored = isColoredIconTheme(themeColor, isDarkMode);
  const pinned = new Set(normalizeQuickPicks(settings.readerQuickPicks));

  useEffect(() => {
    if (!isOpen) setHoveredRow(null);
  }, [isOpen]);

  const actions = useMoreActions({
    bookKey,
    anchorEl,
    onDone: onClose,
    onOpenLibrary: () => onOpenLibrary(),
    onOpenContents: () => onOpenContents(),
    onOpenThemeFonts: (target) => onOpenThemeFonts(target.getBoundingClientRect()),
    onOpenAnnotations: (target) => onOpenAnnotations(target.getBoundingClientRect()),
    onOpenBooknotes: (target) => onOpenBooknotes(target.getBoundingClientRect()),
    onToggleTTS,
  });

  const homeRow = getHomeRowVariant({
    now: new Date(),
    bookKey,
    sessionSeed: getAppSessionSeed(),
  });

  const sections: Array<{ label: string | null; ids: QuickPickId[] }> = [
    { label: null, ids: ['library', 'contents'] },
    { label: _('Appearance'), ids: ['theme-fonts'] },
    { label: _('Notes & Highlights'), ids: ['annotations', 'bookmarks'] },
    {
      label: _('Augment your reading'),
      ids: [
        'margins',
        'mindmap',
        'discuss',
        'summarise',
        'tts',
        'mood-modes',
        'moving-pictures',
        'ruler',
      ],
    },
  ];

  const hoverHandlers = (row: string) => ({
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') setHoveredRow(row);
    },
    onPointerLeave: () => setHoveredRow(null),
  });

  const dragHandlers = (id: QuickPickId) => ({
    draggable: true,
    onDragStart: (event: React.DragEvent) => {
      event.dataTransfer.setData(QUICK_PICK_DRAG_TYPE, id);
      event.dataTransfer.effectAllowed = 'move';
      onArrangeChange?.(true);
    },
    onDragEnd: () => onArrangeChange?.(false),
  });

  const artProps = (row: string, order: number) => ({
    colored,
    hovered: hoveredRow === row,
    openDelayMs: order * OPEN_STAGGER_MS,
  });

  const renderArt = (id: QuickPickId, order: number) => {
    if (SPARK_ICONS.has(id)) {
      return <SparkTileArt icon={id} imgClassName={TOOL_ART_CLASS} {...artProps(id, order)} />;
    }
    switch (id) {
      case 'library':
        return <LibraryArt {...artProps(id, order)} />;
      case 'contents':
        return <ContentsArt {...artProps(id, order)} />;
      case 'theme-fonts':
        return <ThemeFontsArt {...artProps(id, order)} />;
      case 'annotations':
        return <AnnotationsCupArt {...artProps(id, order)} />;
      case 'bookmarks':
        return <BookmarksNotesArt {...artProps(id, order)} />;
      case 'ruler':
        return <ReadingRulerArt {...artProps(id, order)} />;
      default:
        return (
          <TextInMotionArt
            themeName={themeColor}
            isDarkMode={isDarkMode}
            hovered={hoveredRow === id}
          />
        );
    }
  };

  const renderRowContent = (id: QuickPickId, action: MoreAction, order: number) => (
    <>
      <span
        className={clsx(ART_CLASS, isArranging && 'quick-pick-wobble')}
        style={isArranging ? { animationDelay: `${-order * WOBBLE_STAGGER_S}s` } : undefined}
      >
        {renderArt(id, order)}
      </span>
      <span className='flex flex-col gap-0.5'>
        <span className='flex items-center gap-2'>
          <span className={CAPTION_CLASS}>
            {action.title}
            {action.hosts && (
              <>
                {' '}
                <span className={SUBTITLE_CLASS}>{_('with')}</span>{' '}
                <span className='popover-title text-base-content text-xs'>{action.hosts}</span>
              </>
            )}
          </span>
          {action.beta && (
            <img
              src='/images/toolbar/beta-tag.svg'
              alt=''
              className='h-[7px] w-[19px] max-w-none'
            />
          )}
        </span>
        <span className={SUBTITLE_CLASS}>{action.subtitle}</span>
      </span>
    </>
  );

  const renderRow = (id: QuickPickId, order: number) => {
    const action = actions[id];
    if (action.toggled === undefined) {
      return (
        <button
          key={id}
          type='button'
          className={ROW_CLASS}
          onClick={(event) => action.run(event.currentTarget)}
          {...hoverHandlers(id)}
          {...dragHandlers(id)}
        >
          {renderRowContent(id, action, order)}
        </button>
      );
    }
    return (
      <label
        key={id}
        className={`${ROW_CLASS} cursor-pointer`}
        {...hoverHandlers(id)}
        {...dragHandlers(id)}
      >
        {renderRowContent(id, action, order)}
        <span className='relative ms-auto flex shrink-0'>
          <input
            type='checkbox'
            className='peer absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0'
            checked={action.toggled}
            onChange={(event) => action.run(event.currentTarget)}
          />
          <img
            src={action.toggled ? SWITCH_ON_SRC[id] : SWITCH_OFF_SRC}
            alt=''
            className='peer-focus-visible:ring-base-content/40 h-[15px] w-[35px] max-w-none rounded-full peer-focus-visible:ring-2'
          />
        </span>
      </label>
    );
  };

  const visibleSections = sections
    .map((section) => ({ ...section, ids: section.ids.filter((id) => !pinned.has(id)) }))
    .filter((section) => section.ids.length > 0);

  let order = 0;
  const nextOrder = () => order++;

  const handleGoHome = () => {
    onClose();
    onGoHome();
  };

  return (
    <ToolbarPopover
      isOpen={isOpen}
      anchorEl={anchorEl}
      width={MORE_POPOVER_WIDTH}
      onClose={onClose}
    >
      <div className='flex flex-col gap-4 px-4 pb-4 pt-4'>
        <PopoverTitleBar title={_('More')} showDivider />
        {visibleSections.map((section) =>
          section.label ? (
            <div key={section.label} className='flex flex-col gap-1'>
              <span className={SECTION_LABEL_CLASS}>{section.label}</span>
              {section.ids.map((id) => renderRow(id, nextOrder()))}
            </div>
          ) : (
            section.ids.map((id) => renderRow(id, nextOrder()))
          ),
        )}
        <button
          type='button'
          className='eink-bordered bg-base-300 mt-1 flex w-full items-center justify-between gap-3 rounded-lg px-4 py-3 text-start transition-opacity hover:opacity-90'
          onClick={handleGoHome}
          {...hoverHandlers('home')}
        >
          <span className='flex flex-col gap-0.5'>
            <span className={CAPTION_CLASS}>{_('Done reading for now?')}</span>
            <span className='popover-label text-base-content/60'>{_(homeRow.subtitle)}</span>
          </span>
          <HomeArt icon={homeRow.icon} {...artProps('home', nextOrder())} />
        </button>
      </div>
    </ToolbarPopover>
  );
};

export default MorePopover;
