import clsx from 'clsx';
import React, { useState } from 'react';
import { IconType } from 'react-icons';
import { IoIosBuild } from 'react-icons/io';
import { MdChevronLeft, MdChevronRight } from 'react-icons/md';
import { RiDeleteBinLine } from 'react-icons/ri';
import { Position } from '@/utils/sel';
import { BookNote, HighlightColor, HighlightStyle } from '@/types/book';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { getSelectionIconColor, getSelectionIconSrc } from '@/utils/toolbarIcons';
import { HIGHLIGHT_COLOR_HEX } from '@/services/constants';
import { useSettingsStore } from '@/store/settingsStore';
import { stubTranslation as _s } from '@/utils/misc';
import Popup from '@/components/Popup';
import AnnotationNotes from './AnnotationNotes';

void [_s('highlight'), _s('underline'), _s('squiggly'), _s('strikethrough')];
void [_s('red'), _s('yellow'), _s('green'), _s('blue'), _s('violet')];

const STYLE_ORDER: HighlightStyle[] = ['underline', 'highlight', 'squiggly', 'strikethrough'];
const STYLE_ICON_NAMES: Record<HighlightStyle, string> = {
  highlight: 'highlight',
  underline: 'underline',
  squiggly: 'underline-wavy',
  strikethrough: 'strikethrough',
};
const STYLE_ICON_HEIGHTS: Record<HighlightStyle, string> = {
  highlight: 'h-5',
  underline: 'h-5',
  squiggly: 'h-[21px]',
  strikethrough: 'h-[31px]',
};
const COLOR_ORDER: HighlightColor[] = ['yellow', 'green', 'violet', 'blue', 'red'];
const COLOR_ASSET_NAMES: Record<string, string> = {
  red: 'pink',
  yellow: 'yellow',
  green: 'green',
  blue: 'blue',
  violet: 'purple',
};

const MAX_TERM_LENGTH = 16;

const shortenTerm = (text: string): string => {
  const term = text.trim().replace(/\s+/g, ' ');
  return term.length > MAX_TERM_LENGTH ? `${term.slice(0, MAX_TERM_LENGTH)}…` : term;
};

export interface AnnotationPopupAction {
  id: string;
  label: string;
  Icon: IconType;
  onClick: () => void;
}

interface AnnotationPopupProps {
  bookKey: string;
  dir: 'ltr' | 'rtl';
  isVertical: boolean;
  selectedText: string;
  notes: BookNote[];
  position: Position;
  trianglePosition: Position;
  selectedStyle: HighlightStyle;
  selectedColor: HighlightColor;
  annotatedStyle: HighlightStyle | null;
  popupWidth: number;
  popupHeight: number;
  canShare: boolean;
  onSelectStyle: (style: HighlightStyle) => void;
  onSelectColor: (color: HighlightColor) => void;
  onBookmark: () => void;
  onAddNote: () => void;
  onLookup: () => void;
  onTranslate: () => void;
  onSearch: () => void;
  onCopy: () => void;
  onShare: () => void;
  onDelete: () => void;
  canProofread: boolean;
  onProofread: () => void;
  extraActions: AnnotationPopupAction[];
  onDismiss: () => void;
}

const AnnotationPopup: React.FC<AnnotationPopupProps> = ({
  bookKey,
  dir,
  isVertical,
  selectedText,
  notes,
  position,
  trianglePosition,
  selectedStyle: _selectedStyle,
  selectedColor,
  annotatedStyle,
  popupWidth,
  popupHeight,
  canShare,
  onSelectStyle,
  onSelectColor,
  onBookmark,
  onAddNote,
  onLookup,
  onTranslate,
  onSearch,
  onCopy,
  onShare,
  onDelete,
  canProofread,
  onProofread,
  extraActions,
  onDismiss,
}) => {
  const _ = useTranslation();
  const { isDarkMode } = useThemeStore();
  const { settings } = useSettingsStore();
  const advancedHints = [
    _('Proofread and fix the text'),
    _('Correct a typo in this passage'),
    _('Replace words across the book'),
    _('Tidy up how the text reads'),
    _('Tools for fixing the text'),
  ];
  const [advancedHintIndex] = useState(() => Math.floor(Math.random() * advancedHints.length));
  const [showAdvanced, setShowAdvanced] = useState(false);

  const activeColor = COLOR_ORDER.includes(selectedColor) ? selectedColor : 'yellow';
  const term = shortenTerm(selectedText);

  const colorHex = (color: HighlightColor): string =>
    settings.globalReadSettings?.customHighlightColors?.[color] ??
    HIGHLIGHT_COLOR_HEX[color] ??
    color;

  const styleIconSrc = (style: HighlightStyle, color: HighlightColor) =>
    getSelectionIconSrc(`${STYLE_ICON_NAMES[style]}-${COLOR_ASSET_NAMES[color]}`, isDarkMode);

  const iconColor = getSelectionIconColor(isDarkMode);
  const selectionIcon = (icon: string) => (
    <img
      src={getSelectionIconSrc(icon, isDarkMode)}
      alt=''
      className='h-[18px] w-auto object-contain'
    />
  );
  const reactIcon = (Icon: IconType) => <Icon className='h-[18px] w-[18px]' color={iconColor} />;
  const rowClassName =
    'not-eink:hover:bg-base-content/5 flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-start disabled:opacity-50';
  const labelClassName =
    'text-base-content truncate text-sm font-medium [font-family:"Avenir_Next_LT_Pro"]';

  const actionRow = (
    icon: string | React.ReactNode,
    label: string,
    onClick: () => void,
    disabled = false,
  ) => (
    <button type='button' className={rowClassName} disabled={disabled} onClick={onClick}>
      <span className='flex w-5 shrink-0 items-center justify-center'>
        {typeof icon === 'string' ? selectionIcon(icon) : icon}
      </span>
      <span className={labelClassName}>{label}</span>
    </button>
  );

  const divider = <div className='border-base-content/10 border-t' />;

  return (
    <div dir={dir}>
      <Popup
        width={popupWidth}
        maxHeight={isVertical ? undefined : popupHeight}
        position={position}
        trianglePosition={trianglePosition}
        className={clsx(
          'selection-popup !bg-base-200 no-scrollbar overflow-y-auto overscroll-contain',
          notes.length > 0 && '!bg-transparent',
        )}
        triangleClassName='!text-base-200'
        onDismiss={onDismiss}
      >
        {notes.length > 0 ? (
          <AnnotationNotes
            bookKey={bookKey}
            isVertical={isVertical}
            notes={notes}
            toolsVisible={false}
            triangleDir={trianglePosition.dir!}
            popupWidth={popupWidth}
            popupHeight={popupHeight}
            onDismiss={onDismiss}
          />
        ) : showAdvanced ? (
          <div className='flex flex-col gap-1.5 px-3 py-2.5'>
            <div className='flex items-center gap-1'>
              <button
                type='button'
                aria-label={_('Back')}
                className='not-eink:hover:bg-base-content/5 flex h-8 w-8 items-center justify-center rounded-md'
                onClick={() => setShowAdvanced(false)}
              >
                <MdChevronLeft className='h-5 w-5 rtl:rotate-180' color={iconColor} />
              </button>
              <span className={labelClassName}>{_('Advanced settings')}</span>
            </div>
            {divider}
            <div className='flex flex-col'>
              {actionRow(reactIcon(IoIosBuild), _('Proofread'), onProofread, !canProofread)}
            </div>
          </div>
        ) : (
          <div className='flex flex-col gap-1.5 px-3 py-2.5'>
            <div className='flex items-center justify-between px-1'>
              {STYLE_ORDER.map((style) => (
                <button
                  key={style}
                  type='button'
                  aria-label={_('{{style}} style', { style: _(style) })}
                  aria-pressed={annotatedStyle === style}
                  onClick={() => onSelectStyle(style)}
                  className={clsx(
                    'relative flex h-10 w-10 items-center justify-center rounded-lg',
                    annotatedStyle === style && 'bg-base-content/10 eink-bordered',
                  )}
                >
                  {COLOR_ORDER.map((color) => (
                    <img
                      key={color}
                      src={styleIconSrc(style, color)}
                      alt=''
                      className={clsx(
                        'absolute inset-0 m-auto w-auto object-contain transition-opacity duration-200',
                        STYLE_ICON_HEIGHTS[style],
                        activeColor === color ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  ))}
                </button>
              ))}
            </div>
            <div className='flex items-center justify-between px-1 pb-0.5'>
              {COLOR_ORDER.map((color) => (
                <button
                  key={color}
                  type='button'
                  aria-label={_('{{color}} color', { color: _(color) })}
                  aria-pressed={activeColor === color}
                  onClick={() => onSelectColor(color)}
                  className={clsx(
                    'eink-bordered h-6 w-6 rounded-full transition-transform duration-200',
                    activeColor === color && 'ring-base-content/25 scale-110 ring-2 ring-offset-1',
                  )}
                  style={{ backgroundColor: colorHex(color) }}
                />
              ))}
            </div>
            {divider}
            <div className='flex flex-col'>
              {actionRow('bookmark-outline', _('Bookmark page'), onBookmark)}
              {actionRow('add-note-outline', _('Add note'), onAddNote)}
              {annotatedStyle !== null &&
                actionRow(reactIcon(RiDeleteBinLine), _('Delete'), onDelete)}
            </div>
            {divider}
            <div className='flex flex-col'>
              {actionRow('lookup', _('Look up "{{term}}"', { term }), onLookup)}
              {actionRow('translate', _('Translate "{{term}}"', { term }), onTranslate)}
            </div>
            {divider}
            <div className='flex flex-col'>
              {actionRow('search', _('Search'), onSearch)}
              {actionRow('copy', _('Copy'), onCopy)}
              {canShare && actionRow('share', _('Share'), onShare)}
              {extraActions.map((action) => (
                <React.Fragment key={action.id}>
                  {actionRow(reactIcon(action.Icon), action.label, action.onClick)}
                </React.Fragment>
              ))}
            </div>
            {divider}
            <button type='button' className={rowClassName} onClick={() => setShowAdvanced(true)}>
              <span className='flex min-w-0 flex-1 flex-col'>
                <span className={labelClassName}>{_('Advanced settings')}</span>
                <span className='text-base-content/55 truncate text-xs [font-family:"Avenir_Next_LT_Pro"]'>
                  {advancedHints[advancedHintIndex]}
                </span>
              </span>
              <MdChevronRight className='h-5 w-5 shrink-0 rtl:rotate-180' color={iconColor} />
            </button>
          </div>
        )}
      </Popup>
    </div>
  );
};

export default AnnotationPopup;
