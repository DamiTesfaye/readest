import { describe, expect, it, vi } from 'vitest';
import type { BookDoc, TOCItem } from '@/libs/document';
import { updateToc } from '@/services/nav';

vi.mock('@/utils/simplecc', () => ({
  initSimpleCC: async () => undefined,
  runSimpleCC: (text: string, variant: string) => `${variant}(${text})`,
}));

const bookWith = (toc: TOCItem[]): BookDoc => ({ toc, rendition: {} }) as unknown as BookDoc;

describe('updateToc label conversion', () => {
  it('keeps the book label as sourceLabel and converts from it every time', async () => {
    const toc = [
      {
        id: 1,
        label: '第一章',
        href: 'c1.xhtml',
        index: 0,
        subitems: [{ id: 2, label: '开始', href: 'c1.xhtml#s', index: 0 }],
      },
    ] as TOCItem[];
    const book = bookWith(toc);
    await updateToc(book, false, 's2t');
    await updateToc(book, false, 't2s');
    expect(toc[0]).toMatchObject({ label: 't2s(第一章)', sourceLabel: '第一章' });
    expect(toc[0]!.subitems![0]).toMatchObject({ label: 't2s(开始)', sourceLabel: '开始' });
  });
});
