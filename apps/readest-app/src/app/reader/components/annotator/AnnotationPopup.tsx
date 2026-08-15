import clsx from 'clsx';
import React from 'react';
import { Position } from '@/utils/sel';
import { BookNote, HighlightColor, HighlightStyle } from '@/types/book';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/hooks/useTranslation';
import { getSelectionIconSrc } from '@/utils/toolbarIcons';
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
  onDismiss,
}) => {
  const _ = useTranslation();
  const { isDarkMode } = useThemeStore();
  const { settings } = useSettingsStore();

  const activeColor = COLOR_ORDER.includes(selectedColor) ? selectedColor : 'yellow';
  const term = shortenTerm(selectedText);

  const colorHex = (color: HighlightColor): string =>
    settings.globalReadSettings?.customHighlightColors?.[color] ??
    HIGHLIGHT_COLOR_HEX[color] ??
    color;

  const styleIconSrc = (style: HighlightStyle, color: HighlightColor) =>
    getSelectionIconSrc(`${STYLE_ICON_NAMES[style]}-${COLOR_ASSET_NAMES[color]}`, isDarkMode);

  const actionRow = (icon: string, label: string, onClick: () => void) => (
    <button
      type='button'
      className='not-eink:hover:bg-base-content/5 flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-start'
      onClick={onClick}
    >
      <span className='flex w-5 shrink-0 items-center justify-center'>
        <img
          src={getSelectionIconSrc(icon, isDarkMode)}
          alt=''
          className='h-[18px] w-auto object-contain'
        />
      </span>
      <span className='text-base-content truncate text-sm font-medium [font-family:"Avenir_Next_LT_Pro"]'>
        {label}
      </span>
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
            </div>
          </div>
        )}
      </Popup>
    </div>
  );
};

export default AnnotationPopup;
