import clsx from 'clsx';
import React from 'react';
import { BookSearchConfig, SearchMode } from '@/types/book';
import { useTranslation } from '@/hooks/useTranslation';
import { DEFAULT_NEARBY_WORDS, modeToWholeWords } from '@/utils/searchConfig';

interface SearchFilterProps {
  isEink: boolean;
  searchConfig: BookSearchConfig;
  onSearchConfigChanged: (searchConfig: BookSearchConfig) => void;
}

interface ChipProps {
  label: string;
  isActive: boolean;
  isEink: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}

const Chip: React.FC<ChipProps> = ({ label, isActive, isEink, onClick, disabled, title }) => (
  <button
    type='button'
    disabled={disabled}
    title={title}
    aria-pressed={isActive}
    onClick={disabled ? undefined : onClick}
    className={clsx(
      'shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors',
      isEink && 'eink-bordered',
      isActive
        ? 'bg-base-content text-base-100 font-medium'
        : 'bg-base-content/10 text-base-content hover:bg-base-content/20',
      disabled && 'hover:bg-base-content/10 cursor-not-allowed opacity-40',
    )}
  >
    {label}
  </button>
);

const ChipGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className='flex flex-col gap-2'>
    <span className='text-base-content/70 text-xs font-semibold'>{label}</span>
    <div className='flex flex-wrap gap-2'>{children}</div>
  </div>
);

const NEARBY_WORDS_PRESETS = [5, 10, 20, 50];

const SearchFilter: React.FC<SearchFilterProps> = ({
  isEink,
  searchConfig,
  onSearchConfigChanged,
}) => {
  const _ = useTranslation();

  const update = (patch: Partial<BookSearchConfig>) =>
    onSearchConfigChanged({ ...searchConfig, ...patch });
  const setMode = (mode: SearchMode) => update({ mode, matchWholeWords: modeToWholeWords(mode) });

  const mode = searchConfig.mode;
  const isRegex = mode === 'regex';
  const regexHint = isRegex ? _('Not for regex') : undefined;

  return (
    <div className='search-filter px-4 pb-4 pt-3'>
      <h2 className='mb-4 text-center text-base font-bold'>{_('Filter')}</h2>

      <div className='flex flex-col gap-4'>
        <ChipGroup label={_('Search In')}>
          <Chip
            label={_('Entire Book')}
            isEink={isEink}
            isActive={searchConfig.scope === 'book'}
            onClick={() => update({ scope: 'book' })}
          />
          <Chip
            label={_('Current Chapter')}
            isEink={isEink}
            isActive={searchConfig.scope === 'section'}
            onClick={() => update({ scope: 'section' })}
          />
        </ChipGroup>

        <ChipGroup label={_('Find')}>
          <Chip
            label={_('Contains')}
            isEink={isEink}
            isActive={mode === 'contains'}
            onClick={() => setMode('contains')}
          />
          <Chip
            label={_('Whole Words')}
            isEink={isEink}
            isActive={mode === 'whole-words'}
            onClick={() => setMode('whole-words')}
          />
          <Chip
            label={_('Nearby Words')}
            isEink={isEink}
            isActive={mode === 'nearby-words'}
            onClick={() => setMode('nearby-words')}
          />
          <Chip
            label={_('Regular Expression')}
            isEink={isEink}
            isActive={isRegex}
            onClick={() => setMode('regex')}
          />
        </ChipGroup>

        {mode === 'nearby-words' && (
          <ChipGroup label={_('Within N words')}>
            {NEARBY_WORDS_PRESETS.map((n) => (
              <Chip
                key={n}
                label={String(n)}
                isEink={isEink}
                isActive={(searchConfig.nearbyWords ?? DEFAULT_NEARBY_WORDS) === n}
                onClick={() => update({ nearbyWords: n })}
              />
            ))}
          </ChipGroup>
        )}

        <ChipGroup label={_('Matching')}>
          <Chip
            label={_('Match Case')}
            isEink={isEink}
            isActive={searchConfig.matchCase}
            onClick={() => update({ matchCase: !searchConfig.matchCase })}
          />
          <Chip
            label={_('Match Diacritics')}
            isEink={isEink}
            isActive={searchConfig.matchDiacritics && !isRegex}
            disabled={isRegex}
            title={regexHint}
            onClick={() => update({ matchDiacritics: !searchConfig.matchDiacritics })}
          />
          <Chip
            label={_('Fuzzy match')}
            isEink={isEink}
            isActive={searchConfig.fuzzy && !isRegex}
            disabled={isRegex}
            title={regexHint}
            onClick={() => update({ fuzzy: !searchConfig.fuzzy })}
          />
          <Chip
            label={_('Ignore Punctuations')}
            isEink={isEink}
            isActive={searchConfig.ignorePunctuation && !isRegex}
            disabled={isRegex}
            title={regexHint}
            onClick={() => update({ ignorePunctuation: !searchConfig.ignorePunctuation })}
          />
        </ChipGroup>
      </div>
    </div>
  );
};

export default SearchFilter;
