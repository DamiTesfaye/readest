export interface AuthorRef {
  id: string;
  name: string;
}

export interface WorkCard {
  id: string;
  title: string;
  authors: AuthorRef[];
  cover: string | null;
  language: string | null;
  hasAudio: boolean;
  formats: string[];
}

export interface Shelf {
  id: string;
  title: string;
  layout: string;
  items: WorkCard[];
  more: string | null;
}

export interface ExploreResponse {
  shelves: Shelf[];
}

export interface Capabilities {
  canRead: boolean;
  canDownload: boolean;
  canTransform: boolean;
}

export interface AssetView {
  id: string;
  kind: string;
  bytes: number | null;
}

export interface EditionView {
  id: string;
  sourceName: string;
  language: string;
  mediaType: string;
  assets: AssetView[];
  capabilities: Capabilities;
  attribution: string | null;
}

export interface WorkDetail {
  id: string;
  title: string;
  description: string | null;
  subjects: string[];
  preferredEditionId: string | null;
  editions: EditionView[];
}
