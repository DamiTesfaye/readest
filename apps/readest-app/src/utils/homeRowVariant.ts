import { stubTranslation as _ } from '@/utils/misc';

export const HOME_ROW_SUBTITLES = [
  _('Head back home'),
  _('Make your way home'),
  _('Return home'),
  _('Back to home screen'),
  _('Return to home page'),
  _('Make tracks for home'),
  _('Set off for home'),
  _('Home sweet home'),
];

export const RETURN_TO_BASE_SUBTITLE = _('Return to base');
export const RETURN_TO_BASE_ODDS = 50;

const TIME_OF_DAY_BUCKET_HOURS = 6;
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const AVALANCHE_MULTIPLIER = 0x85ebca6b;

export type HomeRowIcon = 'go-home' | 'space-base';

export interface HomeRowVariant {
  subtitle: string;
  icon: HomeRowIcon;
}

export interface HomeRowFactors {
  now: Date;
  bookKey: string;
  sessionSeed: number;
}

const hashText = (text: string): number => {
  let hash = FNV_OFFSET_BASIS;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, AVALANCHE_MULTIPLIER);
  hash ^= hash >>> 13;
  return hash >>> 0;
};

export const getHomeRowVariant = ({
  now,
  bookKey,
  sessionSeed,
}: HomeRowFactors): HomeRowVariant => {
  const day = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const timeOfDay = Math.floor(now.getHours() / TIME_OF_DAY_BUCKET_HOURS);
  const bookHash = bookKey.split('-')[0];
  const seed = hashText(`${day}|${timeOfDay}|${bookHash}|${sessionSeed}`);
  if (seed % RETURN_TO_BASE_ODDS === 0) {
    return { subtitle: RETURN_TO_BASE_SUBTITLE, icon: 'space-base' };
  }
  const index = Math.floor(seed / RETURN_TO_BASE_ODDS) % HOME_ROW_SUBTITLES.length;
  return { subtitle: HOME_ROW_SUBTITLES[index]!, icon: 'go-home' };
};

let appSessionSeed: number | undefined;

export const getAppSessionSeed = (): number => {
  appSessionSeed ??= Math.floor(Math.random() * 0x100000000);
  return appSessionSeed;
};
