export const UNTRANSLATED_MARKER = '__STRING_NOT_TRANSLATED__';

export type LocaleBundle = Record<string, string>;

export const parseLocaleBundle = (raw: string): LocaleBundle => {
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return Object.fromEntries(
    Object.entries(data).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && entry[1] !== '' && entry[1] !== UNTRANSLATED_MARKER,
    ),
  );
};
