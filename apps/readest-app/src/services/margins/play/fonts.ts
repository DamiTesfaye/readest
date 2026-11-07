import type { CustomFont } from '@/styles/fonts';

export const STAND_IN_FACES = {
  serif: ['SourceSerif4-Regular', 'SourceSerif4-It', 'SourceSerif4-Bold'],
  sans: ['SourceSans3-Regular', 'SourceSans3-It', 'SourceSans3-Bold'],
} as const;

const SANS = /sans|grotesk|helvetica|arial|inter|roboto|mono/i;

export const standInFor = (cssFamily: string): 'serif' | 'sans' =>
  SANS.test(cssFamily) ? 'sans' : 'serif';

const isSfnt = (b: Uint8Array) => {
  const tag = String.fromCharCode(...b.subarray(0, 4));
  return (
    tag === 'wOFF' ||
    tag === 'OTTO' ||
    tag === 'true' ||
    (b[0] === 0 && b[1] === 1 && b[2] === 0 && b[3] === 0)
  );
};

const firstFamily = (css: string) =>
  css
    .split(',')[0]!
    .trim()
    .replace(/^["']|["']$/g, '')
    .toLowerCase();

export const resolvePlayFont = async (args: {
  cssFamily: string;
  customFonts: CustomFont[];
  fetchBytes(url: string): Promise<Uint8Array>;
}): Promise<{ key: string; bytes: Uint8Array; tier: 'reader' | 'standIn' }> => {
  const want = firstFamily(args.cssFamily);
  const custom = args.customFonts.find(
    (f) => (f.family ?? f.name).toLowerCase() === want && f.blobUrl,
  );
  if (custom?.blobUrl) {
    const bytes = await args.fetchBytes(custom.blobUrl).catch(() => null);
    if (bytes && isSfnt(bytes)) return { key: `custom:${custom.id}`, bytes, tier: 'reader' };
  }
  const key = STAND_IN_FACES[standInFor(args.cssFamily)][0];
  return {
    key,
    bytes: await args.fetchBytes(`/vendor/margin-play/fonts/${key}.ttf`),
    tier: 'standIn',
  };
};
