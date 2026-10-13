import type { TOCItem } from '@/libs/document';
import type { BookLocator } from '@/services/mindmap/generate/anchors';
import type {
  MapIntent,
  NodeKind,
  PresetColor,
  RecordAnchor,
} from '@/services/mindmap/schema/types';
import type { Book, BookNote } from '@/types/book';

export type ResolvedIntent = Exclude<MapIntent, 'adaptive'>;

export interface GenNode {
  type: 'node';
  genKey: string;
  kind: NodeKind;
  label: string;
  color: PresetColor;
  anchor: RecordAnchor | null;
  revealAt: number | null;
  parentGenKey: string | null;
}

export interface GenLink {
  type: 'link';
  genKey: string;
  fromGenKey: string;
  toGenKey: string;
  label: string;
}

export type GenRecord = GenNode | GenLink;

export interface GenerateInput {
  book: Book;
  toc: readonly TOCItem[];
  annotations: readonly BookNote[];
  intent: ResolvedIntent;
  locator: BookLocator;
}

export interface MapGenerator {
  id: string;
  generate(input: GenerateInput): Promise<GenRecord[]>;
  isGone?(genKey: string, input: GenerateInput): boolean;
}
