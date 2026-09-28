export type RGBA = [number, number, number, number];

const ctx = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.getContext('2d', { willReadFrequently: true })!;
})();

export const parseColor = (css: string): RGBA => {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = '#00000000';
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a / 255];
};

export const over = (fg: RGBA, bg: RGBA): RGBA => {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
};

const channel = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]: RGBA): number =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

export const contrast = (fg: RGBA, bg: RGBA): number => {
  const solid = over(fg, bg);
  const a = luminance(solid);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

export const hex = ([r, g, b, a]: RGBA): string =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}${a < 1 ? `@${a.toFixed(2)}` : ''}`;

export const shadowColor = (boxShadow: string): string | null => {
  const re =
    /(rgba?\([^)]*\)|oklch\([^)]*\)|color\([^)]*\)|#[0-9a-f]+)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px/gi;
  let best: { color: string; spread: number } | null = null;
  for (const m of boxShadow.matchAll(re)) {
    const spread = Number(m[5]);
    if (!best || spread > best.spread) best = { color: m[1]!, spread };
  }
  return best && best.spread > 0 ? best.color : null;
};
