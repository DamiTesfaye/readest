export interface SectionInput {
  runs: string[];
  breaks: number[];
  skip: boolean;
}

export interface FileHint {
  fileHash: string;
  cfi: string;
}

export type Quote =
  | { exact: string }
  | { head: string; tail: string; len: number; spanHash: string };

export interface Anchor {
  textId: string | null;
  kind: 'span' | 'book';
  quote: Quote;
  context: {
    prefixHash: string;
    suffixHash: string;
    prefix: string | null;
    suffix: string | null;
  };
  hint: { position: number; file: FileHint | null };
  v: number;
}

export type Resolution =
  | {
      result: 'placed';
      section: number;
      start: number;
      end: number;
      step: 1 | 2 | 3;
      confidence: number;
    }
  | { result: 'notInThisVersion'; near: [number, number] | null; confidence: number }
  | { result: 'detached'; reason: string };

export interface CanonicalSection {
  text: string;
  runs: { run: number; canonByteStart: number }[];
}

export interface BuildAnchorRequest {
  section: number;
  start: number;
  end: number;
  capped: boolean;
  file?: FileHint;
}
