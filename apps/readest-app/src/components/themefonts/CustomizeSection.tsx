import clsx from 'clsx';
import React, { useMemo, useRef, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useReaderStore } from '@/store/readerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { saveViewSettings } from '@/helpers/settings';
import {
  IOS_FONTS,
  LINUX_FONTS,
  MACOS_FONTS,
  MONOSPACE_FONTS,
  SANS_SERIF_FONTS,
  SERIF_FONTS,
  WINDOWS_FONTS,
} from '@/services/constants';
import { getOSPlatform } from '@/utils/misc';
import { getMaxInlineSize } from '@/utils/config';
import { useCustomFontStore } from '@/store/customFontStore';
import BackgroundSwatchRow from '@/components/settings/color/BackgroundSwatchRow';
import FontSelector from './FontSelector';
import SelectField from './SelectField';
import {
  ColumnGapsIcon,
  GearIcon,
  LetterSpacingIcon,
  LineHeightIcon,
  MarginBottomIcon,
  MarginIcon,
  MarginLeftIcon,
  MarginRightIcon,
  MarginTopIcon,
  NoOfColumnsIcon,
  WordSpacingIcon,
} from './icons';
import {
  CUSTOMIZE_DEFAULTS,
  CUSTOMIZE_VIEW_KEYS,
  CustomizeSnapshot,
  CustomizeViewKey,
  CustomizeViewState,
  captureCustomizeSnapshot,
  diffViewSnapshot,
  uniformValue,
} from './model';

const FIELD_ICON = 'h-3.5 w-auto shrink-0';

interface CustomizeSectionProps {
  bookKey: string;
  onCollapse: () => void;
}

const CustomizeSection: React.FC<CustomizeSectionProps> = ({ bookKey, onCollapse }) => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const {
    themeColor,
    themeMode,
    themeBackground,
    setThemeColor,
    setThemeMode,
    setThemeBackground,
  } = useThemeStore();
  const { getView, getViewSettings } = useReaderStore();
  const viewSettings = getViewSettings(bookKey);

  const save = saveViewSettings as unknown as (
    envConfig: unknown,
    bookKey: string,
    key: string,
    value: unknown,
  ) => void;

  const [marginsExpanded, setMarginsExpanded] = useState(false);
  const snapshotRef = useRef<CustomizeSnapshot | null>(null);
  if (!snapshotRef.current && viewSettings) {
    snapshotRef.current = captureCustomizeSnapshot(
      viewSettings as unknown as Record<string, unknown>,
      { themeColor, themeMode, themeBackground },
    );
  }

  const [values, setValues] = useState<CustomizeViewState>(() =>
    Object.fromEntries(
      CUSTOMIZE_VIEW_KEYS.map((key) => [
        key,
        (viewSettings as unknown as Record<string, unknown> | null)?.[key],
      ]),
    ),
  );

  const apply = (key: CustomizeViewKey, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    save(envConfig, bookKey, key, value);
    const view = getView(bookKey);
    if (!view) return;
    if (key === 'gapPercent') {
      view.renderer.setAttribute('gap', `${value}%`);
      if (getViewSettings(bookKey)?.scrolled) {
        view.renderer.setAttribute('flow', 'scrolled');
      }
    } else if (key === 'maxColumnCount') {
      const updated = getViewSettings(bookKey);
      view.renderer.setAttribute('max-column-count', value as number);
      if (updated) {
        view.renderer.setAttribute('max-inline-size', `${getMaxInlineSize(updated)}px`);
      }
    }
  };

  const handleCancel = () => {
    const snapshot = snapshotRef.current;
    if (snapshot) {
      for (const [key, value] of diffViewSnapshot(snapshot.view, values)) {
        save(envConfig, bookKey, key, value);
      }
      setThemeColor(snapshot.theme.themeColor);
      setThemeMode(snapshot.theme.themeMode);
      setThemeBackground(snapshot.theme.themeBackground);
    }
    onCollapse();
  };

  const handleReset = () => {
    for (const key of CUSTOMIZE_VIEW_KEYS) {
      const value = CUSTOMIZE_DEFAULTS[key];
      if (value !== undefined && values[key] !== value) {
        apply(key, value);
      }
    }
    setThemeColor('default');
    setThemeMode('auto');
    setThemeBackground(null);
  };

  const numeric = (key: CustomizeViewKey, fallback: number): number => {
    const value = values[key];
    return typeof value === 'number' ? value : fallback;
  };

  const { getFontFamilies } = useCustomFontStore();
  const fontOptions = useMemo(() => {
    const sysFonts =
      { macos: MACOS_FONTS, windows: WINDOWS_FONTS, linux: LINUX_FONTS, ios: IOS_FONTS }[
        getOSPlatform() as string
      ] ?? [];
    return Array.from(
      new Set([
        ...SERIF_FONTS,
        ...SANS_SERIF_FONTS,
        ...MONOSPACE_FONTS,
        ...getFontFamilies(),
        ...sysFonts,
      ]),
    );
  }, [getFontFamilies]);
  const selectedFamily = String(
    values['defaultFont'] === 'Sans-serif'
      ? (values['sansSerifFont'] ?? '')
      : (values['serifFont'] ?? ''),
  );
  const handleFamilySelect = (font: string) => {
    if (SANS_SERIF_FONTS.includes(font)) {
      apply('sansSerifFont', font);
      apply('defaultFont', 'Sans-serif');
    } else {
      apply('serifFont', font);
      apply('defaultFont', 'Serif');
    }
    if (values['overrideFont'] !== true) {
      apply('overrideFont', true);
    }
  };

  const isBold = numeric('fontWeight', 400) >= 600;
  const lineHeight = numeric('lineHeight', 1.4);
  const paragraphMargin = numeric('paragraphMargin', 0.6);
  const sharedMargin = uniformValue([
    numeric('marginTopPx', 44),
    numeric('marginBottomPx', 44),
    numeric('marginLeftPx', 16),
    numeric('marginRightPx', 16),
  ]);

  return (
    <div className='flex flex-col gap-3'>
      <BackgroundSwatchRow labelClassName='popover-label' />

      <div className='flex flex-col gap-2 px-4'>
        <span className='text-base-content popover-label'>
          {_('Typography and Layout Options')}
        </span>
        <div className='flex items-center gap-2'>
          <div className='eink-bordered bg-base-100 border-base-content/10 min-w-0 flex-1 rounded-lg border px-1'>
            <FontSelector
              selected={selectedFamily}
              options={fontOptions}
              onSelect={handleFamilySelect}
            />
          </div>
          <SelectField
            className='w-20'
            value={numeric('defaultFontSize', 16)}
            min={8}
            max={120}
            onChange={(value) => apply('defaultFontSize', value)}
          />
          <button
            type='button'
            aria-pressed={isBold}
            title={_('Bold')}
            className={clsx(
              'eink-bordered h-8 w-8 rounded-lg font-serif text-lg font-bold',
              isBold ? 'bg-base-content text-base-100' : 'bg-base-200 text-base-content',
            )}
            onClick={() => apply('fontWeight', isBold ? 400 : 700)}
          >
            B
          </button>
        </div>

        <div className='grid grid-cols-3 gap-x-2 gap-y-2'>
          <SelectField
            label={_('Line Height')}
            icon={<LineHeightIcon className={FIELD_ICON} />}
            value={lineHeight}
            min={1.0}
            max={3.0}
            step={0.1}
            onChange={(value) => apply('lineHeight', value)}
          />
          <SelectField
            label={_('Letter Spacing')}
            icon={<LetterSpacingIcon className={FIELD_ICON} />}
            value={numeric('letterSpacing', 0)}
            min={-2}
            max={10}
            step={0.5}
            onChange={(value) => apply('letterSpacing', value)}
          />
          <SelectField
            label={_('Word Spacing')}
            icon={<WordSpacingIcon className={FIELD_ICON} />}
            value={numeric('wordSpacing', 0)}
            min={-4}
            max={20}
            step={1}
            onChange={(value) => apply('wordSpacing', value)}
          />
          <SelectField
            label={_('No. of Columns')}
            icon={<NoOfColumnsIcon className={FIELD_ICON} />}
            value={numeric('maxColumnCount', 2)}
            min={1}
            max={4}
            step={1}
            onChange={(value) => apply('maxColumnCount', value)}
          />
          <SelectField
            label={_('Column Gaps')}
            icon={<ColumnGapsIcon className={FIELD_ICON} />}
            value={numeric('gapPercent', 5)}
            min={0}
            max={30}
            step={1}
            onChange={(value) => apply('gapPercent', value)}
          />
          <div className='flex flex-col justify-end gap-1'>
            <span className='text-base-content/70 popover-field-label flex items-center justify-between'>
              {_('Margins')}
              <button
                type='button'
                aria-pressed={marginsExpanded}
                title={_('Configure Margins')}
                className='text-base-content'
                onClick={() => setMarginsExpanded(!marginsExpanded)}
              >
                <GearIcon
                  className={clsx(
                    'h-3.5 w-3.5 transition-transform duration-300',
                    marginsExpanded ? 'rotate-90' : 'opacity-60',
                  )}
                />
              </button>
            </span>
            <SelectField
              icon={<MarginIcon className={FIELD_ICON} />}
              value={sharedMargin ?? numeric('marginTopPx', 44)}
              display={sharedMargin === null ? '–' : undefined}
              min={0}
              max={120}
              step={4}
              onChange={(value) => {
                apply('marginTopPx', value);
                apply('marginBottomPx', value);
                apply('marginLeftPx', value);
                apply('marginRightPx', value);
              }}
            />
          </div>
          {marginsExpanded && (
            <>
              <SelectField
                label={_('Top Margin')}
                icon={<MarginTopIcon className={FIELD_ICON} />}
                value={numeric('marginTopPx', 44)}
                min={0}
                max={120}
                step={4}
                onChange={(value) => apply('marginTopPx', value)}
              />
              <SelectField
                label={_('Bottom Margin')}
                icon={<MarginBottomIcon className={FIELD_ICON} />}
                value={numeric('marginBottomPx', 44)}
                min={0}
                max={120}
                step={4}
                onChange={(value) => apply('marginBottomPx', value)}
              />
              <SelectField
                label={_('Left Margin')}
                icon={<MarginLeftIcon className={FIELD_ICON} />}
                value={numeric('marginLeftPx', 16)}
                min={0}
                max={120}
                step={4}
                onChange={(value) => apply('marginLeftPx', value)}
              />
              <SelectField
                label={_('Right Margin')}
                icon={<MarginRightIcon className={FIELD_ICON} />}
                value={numeric('marginRightPx', 16)}
                min={0}
                max={120}
                step={4}
                onChange={(value) => apply('marginRightPx', value)}
              />
            </>
          )}
        </div>

        <div className='flex flex-col gap-1'>
          <span className='text-base-content/70 popover-field-label'>{_('Paragraph Margin')}</span>
          <div className='flex items-center gap-2'>
            <input
              type='range'
              min={0}
              max={4}
              step={0.1}
              value={paragraphMargin}
              aria-label={_('Paragraph Margin')}
              className='range range-xs flex-1'
              onChange={(e) => {
                if (values['overrideLayout'] !== true) {
                  apply('overrideLayout', true);
                }
                apply('paragraphMargin', Number(e.target.value));
              }}
            />
            <span className='text-base-content w-8 text-right text-xs'>
              {paragraphMargin.toFixed(1)}
            </span>
          </div>
        </div>
      </div>

      <div className='flex items-center justify-between px-4 pt-5'>
        <button
          type='button'
          className='text-base-content popover-action-label px-2 py-1.5 text-xs'
          onClick={handleReset}
        >
          {_('Reset')}
        </button>
        <div className='flex items-center gap-2'>
          <button
            type='button'
            className='eink-bordered bg-base-300 hover:bg-base-content/10 text-base-content popover-action-label rounded-lg px-4 py-1.5 text-xs'
            onClick={handleCancel}
          >
            {_('Cancel')}
          </button>
          <button
            type='button'
            className='btn-primary bg-base-content text-base-100 popover-action-label rounded-lg px-5 py-1.5 text-xs'
            onClick={onCollapse}
          >
            {_('Done')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomizeSection;
