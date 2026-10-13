import { createContext } from 'react';
import type { ChapterStart } from '@/services/mindmap/reveal/chapters';

export const ChapterStartsContext = createContext<readonly ChapterStart[] | null>(null);
