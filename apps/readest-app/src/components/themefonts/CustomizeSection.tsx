import clsx from 'clsx';
import React, { useRef, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useReaderStore } from '@/store/readerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { saveViewSettings } from '@/helpers/settings';
import { SANS_SERIF_FONTS, SERIF_FONTS } from '@/services/constants';
import BackgroundSwatchRow from '@/components/settings/color/BackgroundSwatchRow';
import FontDropdown from '@/components/settings/FontDropDown';
import NumberInput from '@/components/settings/NumberInput';
import {
  CUSTOMIZE_DEFAULTS,
  CUSTOMIZE_VIEW_KEYS,
  CustomizeSnapshot,
  CustomizeViewKey,
  CustomizeViewState,
  captureCustomizeSnapshot,
  diffViewSnapshot,
} from './model';

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
  const { getViewSettings } = useReaderStore();
  const viewSettings = getViewSettings(bookKey);

  const save = saveViewSettings as unknown as (
    envConfig: unknown,
    bookKey: string,
    key: string,
    value: unknown,
  ) => void;

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

  const fontOptions = [...SERIF_FONTS, ...SANS_SERIF_FONTS].map((font) => ({ option: font }));
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
  };

  const isBold = numeric('fontWeight', 400) >= 600;
  const lineHeight = numeric('lineHeight', 1.4);

  return (
    <div className='flex flex-col gap-3'>
      <div className='px-4'>
        <span className='text-base-content text-xs font-semibold'>{_('Background')}</span>
        <BackgroundSwatchRow />
      </div>

      <div className='flex flex-col gap-2 px-4'>
        <span className='text-base-content text-xs font-semibold'>
          {_('Typography and Layout Options')}
        </span>
        <div className='flex items-center gap-2'>
          <div className='eink-bordered bg-base-200 min-w-0 flex-1 rounded-md px-1'>
            <FontDropdown
              selected={selectedFamily}
              options={fontOptions}
              onSelect={handleFamilySelect}
              onGetFontFamily={(option: string) => option}
            />
          </div>
          <NumberInput
            className='w-24'
            label=''
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
              'eink-bordered h-8 w-8 rounded-md font-serif text-lg font-bold',
              isBold ? 'bg-base-content text-base-100' : 'bg-base-200 text-base-content',
            )}
            onClick={() => apply('fontWeight', isBold ? 400 : 700)}
          >
            B
          </button>
        </div>

        <div className='grid grid-cols-2 gap-x-3 gap-y-1'>
          <NumberInput
            label={_('Line Height')}
            value={lineHeight}
            min={1.0}
            max={3.0}
            step={0.1}
            onChange={(value) => apply('lineHeight', value)}
          />
          <NumberInput
            label={_('Letter Spacing')}
            value={numeric('letterSpacing', 0)}
            min={-2}
            max={10}
            step={0.5}
            onChange={(value) => apply('letterSpacing', value)}
          />
          <NumberInput
            label={_('Word Spacing')}
            value={numeric('wordSpacing', 0)}
            min={-4}
            max={20}
            step={1}
            onChange={(value) => apply('wordSpacing', value)}
          />
          <NumberInput
            label={_('Top Margin')}
            value={numeric('marginTopPx', 44)}
            min={0}
            max={120}
            step={4}
            onChange={(value) => apply('marginTopPx', value)}
          />
          <NumberInput
            label={_('Bottom Margin')}
            value={numeric('marginBottomPx', 44)}
            min={0}
            max={120}
            step={4}
            onChange={(value) => apply('marginBottomPx', value)}
          />
          <NumberInput
            label={_('Left Margin')}
            value={numeric('marginLeftPx', 16)}
            min={0}
            max={120}
            step={4}
            onChange={(value) => apply('marginLeftPx', value)}
          />
          <NumberInput
            label={_('Right Margin')}
            value={numeric('marginRightPx', 16)}
            min={0}
            max={120}
            step={4}
            onChange={(value) => apply('marginRightPx', value)}
          />
          <NumberInput
            label={_('No. of Columns')}
            value={numeric('maxColumnCount', 2)}
            min={1}
            max={4}
            step={1}
            onChange={(value) => apply('maxColumnCount', value)}
          />
          <NumberInput
            label={_('Column Gaps')}
            value={numeric('gapPercent', 5)}
            min={0}
            max={30}
            step={1}
            onChange={(value) => apply('gapPercent', value)}
          />
        </div>

        <div className='flex flex-col gap-1'>
          <p
            className='text-base-content px-2 text-center'
            style={{
              fontFamily: selectedFamily || undefined,
              fontSize: `${Math.min(numeric('defaultFontSize', 16), 20)}px`,
              fontWeight: isBold ? 700 : 400,
              lineHeight,
            }}
          >
            {_(
              'The opened half-door was opened a little further, and secured at that angle for the time. A broad ray of light ...',
            )}
          </p>
          <div className='flex items-center gap-2'>
            <input
              type='range'
              min={1}
              max={3}
              step={0.05}
              value={lineHeight}
              aria-label={_('Line Height')}
              className='range range-xs flex-1'
              onChange={(e) => apply('lineHeight', Number(e.target.value))}
            />
            <span className='text-base-content w-10 text-right text-xs'>
              {lineHeight.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <div className='flex items-center justify-between px-4 pt-1'>
        <button
          type='button'
          className='eink-bordered bg-base-200 hover:bg-base-300 text-base-content rounded-md px-4 py-1.5 text-sm'
          onClick={handleReset}
        >
          {_('Reset')}
        </button>
        <div className='flex gap-2'>
          <button
            type='button'
            className='eink-bordered bg-base-200 hover:bg-base-300 text-base-content rounded-md px-4 py-1.5 text-sm'
            onClick={handleCancel}
          >
            {_('Cancel')}
          </button>
          <button
            type='button'
            className='btn-primary bg-base-content text-base-100 rounded-md px-4 py-1.5 text-sm'
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
