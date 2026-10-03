import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { EPUB } from 'foliate-js/epub.js';
import { SectionProgress } from 'foliate-js/progress.js';
import { DocumentLoader } from '@/libs/document';

type WeightedBook = { sections: { linear?: string; size: number }[] };

const AMPLEREAD_PREFIX = 'ampleread: https://ampleread.app/vocab#';

const CONTAINER = `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const NAV = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>n</title></head>
<body><nav epub:type="toc" id="toc"><ol><li><a href="s000.xhtml">One</a></li></ol></nav></body></html>`;

const section = (index: number, padding: number) =>
  `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>s${index}</title></head>
<body><p>${'word '.repeat(padding)}</p></body></html>`;

const byteLength = (text: string) => new TextEncoder().encode(text).length;

type Weights = Record<string, number> | null;

const makeBook = async (paddings: number[], weights: Weights) => {
  const files: Record<string, string> = {
    'META-INF/container.xml': CONTAINER,
    'OEBPS/nav.xhtml': NAV,
  };
  paddings.forEach((padding, index) => {
    files[`OEBPS/s${index.toString().padStart(3, '0')}.xhtml`] = section(index, padding);
  });
  const ids = paddings.map((_, index) => `s${index.toString().padStart(3, '0')}`);
  const manifest = ids
    .map((id) => `<item id="${id}" href="${id}.xhtml" media-type="application/xhtml+xml"/>`)
    .join('');
  const spine = ids.map((id) => `<itemref idref="${id}"/>`).join('');
  const declared = weights
    ? Object.entries(weights)
        .map(
          ([id, value]) =>
            `<meta property="ampleread:reading-weight" refines="#${id}">${value}</meta>`,
        )
        .join('')
    : '';
  files['OEBPS/package.opf'] = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id"${
    weights ? ` prefix="${AMPLEREAD_PREFIX}"` : ''
  }>
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="pub-id">urn:test</dc:identifier>
<dc:title>t</dc:title><dc:language>en</dc:language>${declared}</metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${manifest}</manifest>
<spine>${spine}</spine></package>`;

  const entries = Object.keys(files).map((filename) => ({
    filename,
    uncompressedSize: byteLength(files[filename]!),
  }));
  const book = new EPUB({
    entries,
    loadText: async (name: string) => files[name] ?? null,
    loadBlob: async () => null,
    getSize: (name: string) => (files[name] ? byteLength(files[name]!) : 0),
    sha1: async () => '',
  });
  await book.init();
  return { book: book as unknown as WeightedBook, files };
};

const totalPages = (book: WeightedBook) =>
  new SectionProgress(book.sections, 1500, 1600).getProgress(0, 0, 0).location.total;

describe('declared reading weight', () => {
  it('sizes a plain EPUB by its uncompressed bytes, exactly as before', async () => {
    const { book, files } = await makeBook([50, 400], null);
    expect(book.sections.map((s: { size: number }) => s.size)).toEqual([
      byteLength(files['OEBPS/s000.xhtml']!),
      byteLength(files['OEBPS/s001.xhtml']!),
    ]);
  });

  it('sizes an ample-document EPUB by the weight it declares', async () => {
    const { book } = await makeBook([50, 4000], { s000: 900, s001: 1500 });
    expect(book.sections.map((s: { size: number }) => s.size)).toEqual([900, 1500]);
  });

  it('falls back to bytes for any spine item that declares no weight', async () => {
    const { book, files } = await makeBook([50, 400], { s000: 900 });
    expect(book.sections.map((s: { size: number }) => s.size)).toEqual([
      900,
      byteLength(files['OEBPS/s001.xhtml']!),
    ]);
  });

  it('counts pages by declared weight instead of graphic bytes', async () => {
    const { book: heavy } = await makeBook([50, 20000], null);
    const { book: weighted } = await makeBook([50, 20000], { s000: 1500, s001: 3000 });
    expect(totalPages(heavy)).toBeGreaterThan(60);
    expect(totalPages(weighted)).toBe(3);
  });

  it('ignores a weight that is not a positive number', async () => {
    const { book, files } = await makeBook([50, 400], { s000: 0 });
    expect(book.sections[0]!.size).toBe(byteLength(files['OEBPS/s000.xhtml']!));
  });
});

describe('a plain EPUB keeps counting by bytes', () => {
  it('totals sample-alice.epub from its uncompressed spine bytes', async () => {
    const path = resolve(__dirname, '../fixtures/data/sample-alice.epub');
    const buffer = readFileSync(path);
    const file = new File([buffer], 'sample-alice.epub', { type: 'application/epub+zip' });
    const { book } = await new DocumentLoader(file).open();

    const sections = book.sections!;
    expect(sections.length).toBeGreaterThan(0);
    const declared = sections.filter((s) => s.size === 0);
    expect(declared.length).toBe(0);

    const total = new SectionProgress(sections, 1500, 1600).getProgress(0, 0, 0).location.total;
    const byBytes = Math.ceil(
      sections.reduce((sum, s) => sum + (s.linear !== 'no' ? s.size : 0), 0) / 1500,
    );
    expect(total).toBe(byBytes);
    expect(total).toBe(112);
  });
});
