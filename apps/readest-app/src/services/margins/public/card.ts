import { GROUND_STYLE } from '@/app/reader/components/margins/ElementView';
import type { Ground } from '../payload';
import { mulberry32 } from '../play/physics';
import { ghostGlyph } from '../replay/ghost';
import { call } from './api';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const PAD = 72;
const LINE = 60;
const GHOST_LINES = 5;
const GHOST_EM = 34;
const GHOST_GAP = 14;
const GHOST_ALPHA = 0.35;
const CITATION_FONT = '30px Georgia, "Times New Roman", serif';
const BYLINE_FONT = '28px system-ui, sans-serif';

export interface CardInput {
  handle: string;
  bookTitle: string | null;
  citation: string;
  ground: Ground;
  art: Blob[];
  seed: number;
}

type Ctx = OffscreenCanvasRenderingContext2D;

const drawArt = async (ctx: Ctx, art: Blob, x: number, y: number, w: number, h: number) => {
  const bitmap = await createImageBitmap(art);
  const scale = Math.min(w / bitmap.width, h / bitmap.height);
  const [dw, dh] = [bitmap.width * scale, bitmap.height * scale];
  ctx.drawImage(bitmap, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  bitmap.close();
};

const drawGhostLines = (ctx: Ctx, seed: number, width: number) => {
  const r = mulberry32(seed);
  let unit = 0;
  ctx.beginPath();
  for (let line = 0; line < GHOST_LINES; line++) {
    const lineWidth = line === GHOST_LINES - 1 ? width * (0.4 + 0.3 * r()) : width;
    const y = PAD + line * LINE;
    for (let at = 0, w = GHOST_EM * (1.5 + 3 * r()); at + w <= lineWidth; ) {
      for (const [gx, gy, gw, gh] of ghostGlyph(seed, unit++, w, GHOST_EM))
        ctx.roundRect(PAD + at + gx, y + gy, gw, gh, Math.min(gw, gh) / 2);
      at += w + GHOST_GAP;
      w = GHOST_EM * (1.5 + 3 * r());
    }
  }
  ctx.globalAlpha = GHOST_ALPHA;
  ctx.fill();
  ctx.globalAlpha = 1;
};

export const renderCard = async ({ handle, bookTitle, citation, ground, art, seed }: CardInput) => {
  const canvas = new OffscreenCanvas(CARD_WIDTH, CARD_HEIGHT);
  const ctx = canvas.getContext('2d')!;
  const { background, color } = GROUND_STYLE[ground];
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  const half = CARD_WIDTH / 2;
  if (art[0])
    await drawArt(ctx, art[0], half + PAD / 2, PAD, half - 1.5 * PAD, CARD_HEIGHT - 2 * PAD);
  ctx.fillStyle = color;
  const width = (art[0] ? half : CARD_WIDTH) - 1.5 * PAD;
  drawGhostLines(ctx, seed, width);
  ctx.textBaseline = 'alphabetic';
  if (citation) {
    ctx.font = CITATION_FONT;
    ctx.fillText(citation, PAD, PAD + (GHOST_LINES + 1) * LINE, width);
  }
  ctx.font = BYLINE_FONT;
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
