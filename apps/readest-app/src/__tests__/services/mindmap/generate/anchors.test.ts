import { describe, expect, it } from 'vitest';
import type { SectionFragment, SectionItem, TOCItem } from '@/libs/document';
import { createBookLocator, resolveJumpTarget } from '@/services/mindmap/generate/anchors';

const section = (
  id: string,
  cfi: string,
  size: number,
  fragments: SectionFragment[] = [],
  linear = 'yes',
): SectionItem => ({
  id,
  cfi,
  size,
  linear,
  fragments,
  createDocument: async () => document,
});

const fragment = (href: string, cfi: string, size: number): SectionFragment => ({
  id: href.split('#')[1]!,
  href,
  cfi,
  size,
  linear: 'yes',
});

const sections = [
  section('title.xhtml', 'epubcfi(/6/2)', 1000),
  section('ch1.xhtml', 'epubcfi(/6/4)', 3000, [
    fragment('ch1.xhtml#b', 'epubcfi(/6/4!/4/10)', 1500),
  ]),
  section('notes.xhtml', 'epubcfi(/6/6)', 500, [], 'no'),
  section('ch2.xhtml', 'epubcfi(/6/8)', 4000),
];

const locator = createBookLocator({ sections, splitTOCHref: (href) => href.split('#') });

const tocItem = (href: string, index?: number): TOCItem =>
  ({ id: 1, label: 'Chapter', href, index }) as TOCItem;

describe('createBookLocator', () => {
  it('places a section href at the linear size before it', () => {
    expect(locator.locateToc(tocItem('ch1.xhtml'))).toEqual({
      cfi: 'epubcfi(/6/4)',
      section: 1,
      progress: 0.125,
    });
  });

  it('places a fragment href at its own offset even without a TOC location', () => {
    expect(locator.locateToc(tocItem('ch1.xhtml#b'))).toEqual({
      cfi: 'epubcfi(/6/4!/4/10)',
      section: 1,
      progress: 0.3125,
    });
  });

  it('falls back to the section when the fragment is unknown', () => {
    expect(locator.locateToc(tocItem('ch1.xhtml#missing'))?.progress).toBe(0.125);
  });

  it('skips non-linear sections when measuring progress', () => {
    expect(locator.locateToc(tocItem('ch2.xhtml'))?.progress).toBe(0.5);
  });

  it('returns null for an href outside the book', () => {
    expect(locator.locateToc(tocItem('elsewhere.xhtml'))).toBeNull();
  });

  it('uses the page index of a page-indexed TOC item', () => {
    const pages = createBookLocator({
      sections: [section('0', '', 1000), section('1', '', 1000)],
      splitTOCHref: () => Promise.reject(new Error('pdf')) as unknown as string[],
    });
    expect(pages.locateToc(tocItem('{"dest":1}', 1))).toEqual({
      cfi: 'epubcfi(/6/4)',
      section: 1,
      progress: 0.5,
    });
  });

  it('places a highlight at the nearest located point before it in its section', () => {
    expect(locator.locateCfi('epubcfi(/6/4!/4/12/1:0)')).toEqual({
      cfi: 'epubcfi(/6/4!/4/12/1:0)',
      section: 1,
      progress: 0.3125,
    });
    expect(locator.locateCfi('epubcfi(/6/4!/4/2/1:0)')?.progress).toBe(0.125);
  });

  it('returns null for a highlight outside the spine or with a broken cfi', () => {
    expect(locator.locateCfi('epubcfi(/6/40!/4/2/1:0)')).toBeNull();
    expect(locator.locateCfi('not a cfi')).toBeNull();
  });
});

describe('resolveJumpTarget', () => {
  const anchor = { cfi: 'epubcfi(/6/4!/4/12/1:0)', section: 1, progress: 0.3 };

  it('jumps to the cfi while it resolves', () => {
    expect(resolveJumpTarget(anchor, 4, () => true)).toEqual({ kind: 'cfi', cfi: anchor.cfi });
  });

  it('falls back to the section progress when the cfi no longer resolves', () => {
    expect(resolveJumpTarget(anchor, 4, () => false)).toEqual({ kind: 'fraction', fraction: 0.3 });
  });

  it('has no target when the section is gone too', () => {
    expect(resolveJumpTarget(anchor, 1, () => false)).toBeNull();
  });
});

describe('createBookLocator for PDF outlines', () => {
  it('places an outline entry whose destination is a page number', () => {
    const pages = [0, 1, 2].map((index) => section(String(index), '', 100));
    const pdf = createBookLocator({
      sections: pages,
      splitTOCHref: () => Promise.resolve([null, null]) as unknown as Array<string | number>,
    });
    const entry = { id: 1, label: 'Abstract', href: '[2,{"name":"XYZ"},0,792,null]' } as TOCItem;
    expect(pdf.locateToc(entry)).toMatchObject({ section: 2 });
  });
});
