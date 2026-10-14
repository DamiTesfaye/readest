import { describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({ resolveAnchor: vi.fn() }));

vi.mock('@/services/margins/anchorBridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/margins/anchorBridge')>()),
  resolveAnchor: bridge.resolveAnchor,
}));

import { postPlacement } from '@/app/reader/hooks/useMarginsPainter';
import type { BridgeContext } from '@/services/margins/anchorBridge';
import type { PostView } from '@/services/margins/public/api';

const TEXT = 'Ünïcode wörds for the redacted post';
const LEN = [...TEXT].length;

const ctxOf = (hash: string) =>
  ({
    book: { hash },
    bookDoc: { sections: [{}, {}] },
    ready: Promise.resolve(),
    core: {
      sectionLengths: vi.fn(async () => [LEN, 50]),
      canonicalSection: vi.fn(async () => ({ text: TEXT })),
    },
  }) as unknown as BridgeContext;

const redacted = (sectionLen: number) =>
  ({
    id: 'pst_1',
    section: 0,
    start: 6,
    end: 11,
    sectionLen,
    anchor: {
      textId: 'txt_1',
      kind: 'span',
      quote: null,
      context: null,
      hint: { position: 0, file: null },
      v: 1,
    },
  }) as unknown as PostView;

describe('postPlacement', () => {
  it('opens a redacted post by its offsets', async () => {
    const bytes = new TextEncoder();
    const at = (scalar: number) => bytes.encode([...TEXT].slice(0, scalar).join('')).length;
    expect(await postPlacement(redacted(LEN), ctxOf('h1'))).toEqual({
      section: 0,
      start: at(6),
      end: at(11),
    });
    expect(at(6)).not.toBe(6);
    expect(await postPlacement(redacted(LEN + 1), ctxOf('h2'))).toBeNull();
    expect(bridge.resolveAnchor).not.toHaveBeenCalled();
  });
});
