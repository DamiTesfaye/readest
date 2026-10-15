import { GROUND_STYLE } from '@/app/reader/components/margins/ElementView';
import type { Ground } from '../payload';
import { call } from './api';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const PAD = 72;
const QUOTE_FONT = '44px Georgia, "Times New Roman", serif';
const QUOTE_LINE = 60;
const MAX_LINES = 6;
const BYLINE_FONT = '28px system-ui, sans-serif';

export interface CardInput {
  quote: string;
  handle: string;
  bookTitle: string | null;
  ground: Ground;
  art: Blob[];
}

type Ctx = OffscreenCanvasRenderingContext2D;

const fits = (ctx: Ctx, text: string, width: number) => ctx.measureText(text).width <= width;

const ellipsize = (ctx: Ctx, line: string, width: number) => {
  let words = line.split(' ');
  while (words.length > 1 && !fits(ctx, `${words.join(' ')}…`, width)) words = words.slice(0, -1);
  return `${words.join(' ')}…`;
};

const wrap = (ctx: Ctx, text: string, width: number): string[] => {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (!line || fits(ctx, next, width)) {
      line = next;
      continue;
    }
    if (lines.length === MAX_LINES - 1) return [...lines, ellipsize(ctx, line, width)];
    lines.push(line);
    line = word;
  }
  return line ? [...lines, line] : lines;
};

const drawArt = async (ctx: Ctx, art: Blob, x: number, y: number, w: number, h: number) => {
  const bitmap = await createImageBitmap(art);
  const scale = Math.min(w / bitmap.width, h / bitmap.height);
  const [dw, dh] = [bitmap.width * scale, bitmap.height * scale];
  ctx.drawImage(bitmap, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  bitmap.close();
};

export const renderCard = async ({ quote, handle, bookTitle, ground, art }: CardInput) => {
  const canvas = new OffscreenCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d')!;
  const { background, color } = GROUND_STYLE[ground];
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const half = CARD_WIDTH / 2;
  if (art[0])
    await drawArt(ctx, art[0], half + PAD / 2, PAD, half - 1.5 * PAD, CARD_HEIGHT - 2 * PAD);
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.font = QUOTE_FONT;
  const width = (art[0] ? half : CARD_WIDTH) - 1.5 * PAD;
  wrap(ctx, `“${quote.trim()}”`, width).forEach((line, i) =>
    ctx.fillText(line, PAD, PAD + i * QUOTE_LINE),
  );
  ctx.font = BYLINE_FONT;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(
    [`@${handle}`, bookTitle].filter(Boolean).join(' · '),
    PAD,
    CARD_HEIGHT - PAD,
    width,
  );
  return canvas.convertToBlob({ type: 'image/png' });
};

export const uploadCard = async (png: Blob): Promise<string> => {
  const res = await call('/v1/layer-assets', {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: png,
  });
  return ((await res.json()) as { id: string }).id;
};
