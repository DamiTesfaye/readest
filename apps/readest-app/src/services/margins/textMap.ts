import type { BookDoc } from '@/libs/document';
import { loadTextWalker, makeAcceptNode } from '@/services/librarySearchService';
import type { Book } from '@/types/book';
import type { MarginsStore } from './store';
import type { SectionInput } from './types';

export const BLOCK_TAGS = [
  'address',
  'article',
  'aside',
  'blockquote',
  'br',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'td',
  'th',
  'tr',
  'ul',
];

const SKIP_TYPES = [
  'frontmatter',
  'backmatter',
  'toc',
  'titlepage',
  'copyright-page',
  'colophon',
  'imprint',
];

const epubTypes = (el: Element) => (el.getAttribute('epub:type') ?? '').split(/\s+/);

const isSkipped = (doc: Document) =>
  Array.from(doc.querySelectorAll('body, section')).some((el) =>
    epubTypes(el).some((t) => SKIP_TYPES.includes(t)),
  ) || Array.from(doc.querySelectorAll('nav')).some((el) => epubTypes(el).includes('toc'));

export const firstIndex = (nodes: Node[], test: (node: Node) => boolean) => {
  let lo = 0;
  let hi = nodes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (test(nodes[mid]!)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
};

const blockBreaks = (doc: Document, nodes: Node[]) => {
  const breaks = new Set<number>();
  const root = doc.body ?? doc.documentElement;
  if (!root) return [];
  for (const el of Array.from(root.querySelectorAll(BLOCK_TAGS.join(',')))) {
    const opened = firstIndex(
      nodes,
      (n) => (el.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
    );
    const closed = firstIndex(nodes, (n) => {
      const pos = el.compareDocumentPosition(n);
      return (
        (pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
        (pos & Node.DOCUMENT_POSITION_CONTAINED_BY) === 0
      );
    });
    for (const i of [opened, closed]) if (i > 0 && i < nodes.length) breaks.add(i);
  }
  return [...breaks].sort((a, b) => a - b);
};

export const walkSection = async (
  doc: Document,
  book: Book,
): Promise<{ input: SectionInput; nodes: Node[] }> => {
  const walker = await loadTextWalker();
  let runs: string[] = [];
  let nodes: Node[] = [];
  Array.from(
    walker(
      doc,
      (strings: string[], makeRange: (...args: number[]) => Range) => {
        runs = strings;
        nodes = strings.map((_, i) => makeRange(i, 0, i, 0).startContainer);
        return [];
      },
      makeAcceptNode(book),
    ),
  );
  return { input: { runs, breaks: blockBreaks(doc, nodes), skip: isSkipped(doc) }, nodes };
};

export const buildTextMap = async (
  bookDoc: BookDoc,
  book: Book,
  store: MarginsStore,
): Promise<SectionInput[]> => {
  const cached = await store.getTextMap(book.hash);
  if (cached) return cached;
  const sections: SectionInput[] = [];
  for (const section of bookDoc.sections) {
    const doc = await section.createDocument();
    sections.push((await walkSection(doc, book)).input);
  }
  await store.putTextMap(book.hash, sections);
  return sections;
};
