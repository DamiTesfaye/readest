export const QUICK_PICK_IDS = [
  'library',
  'contents',
  'theme-fonts',
  'annotations',
  'bookmarks',
  'margins',
  'mindmap',
  'discuss',
  'summarise',
  'tts',
  'mood-modes',
  'moving-pictures',
  'ruler',
] as const;

export type QuickPickId = (typeof QUICK_PICK_IDS)[number];
export type QuickPickSlots = Array<QuickPickId | null>;

export const QUICK_PICK_SLOT_COUNT = 4;
export const QUICK_PICK_DRAG_TYPE = 'application/x-ample-quick-pick';
export const DEFAULT_QUICK_PICKS: QuickPickSlots = ['library', 'margins', null, 'contents'];

export const isQuickPickId = (value: unknown): value is QuickPickId =>
  typeof value === 'string' && (QUICK_PICK_IDS as readonly string[]).includes(value);

const withLegacyContents = (raw: unknown[]): unknown[] => {
  if (raw.length >= QUICK_PICK_SLOT_COUNT || raw.includes('contents')) return raw;
  const padded = Array.from({ length: QUICK_PICK_SLOT_COUNT }, (_, index) => raw[index] ?? null);
  return padded.map((value, index) => (index === QUICK_PICK_SLOT_COUNT - 1 ? 'contents' : value));
};

export const normalizeQuickPicks = (raw: unknown): QuickPickSlots => {
  if (!Array.isArray(raw)) return [...DEFAULT_QUICK_PICKS];
  const source = withLegacyContents(raw);
  const seen = new Set<QuickPickId>();
  return Array.from({ length: QUICK_PICK_SLOT_COUNT }, (_, index) => {
    const value: unknown = source[index];
    if (!isQuickPickId(value) || seen.has(value)) return null;
    seen.add(value);
    return value;
  });
};

export const placeQuickPick = (
  slots: QuickPickSlots,
  id: QuickPickId,
  index: number,
): QuickPickSlots => {
  const from = slots.indexOf(id);
  return slots.map((slot, i) => {
    if (i === index) return id;
    if (i === from) return slots[index] ?? null;
    return slot;
  });
};

const SPARK_ICONS: ReadonlySet<QuickPickId> = new Set([
  'margins',
  'mindmap',
  'discuss',
  'summarise',
  'tts',
  'mood-modes',
]);

const TOOLBAR_ICONS: Partial<Record<QuickPickId, string>> = {
  library: 'library',
  contents: 'book-toc',
  annotations: 'annotations-cup',
  bookmarks: 'bookmarks-notes',
  'moving-pictures': 'moving-pictures',
  ruler: 'reading-ruler',
};

export const getQuickPickIconSrc = (id: QuickPickId, colored: boolean): string => {
  const suffix = colored ? '' : '-muted';
  if (id === 'theme-fonts') return `/images/theme-fonts/${colored ? 'paper' : 'muted'}-large.svg`;
  if (SPARK_ICONS.has(id)) return `/images/spark/${id}${suffix}.svg`;
  return `/images/toolbar/${TOOLBAR_ICONS[id]}${suffix}.svg`;
};
