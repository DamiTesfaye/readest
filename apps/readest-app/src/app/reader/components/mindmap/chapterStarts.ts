import { createContext } from 'react';

export const ChapterStartsContext = createContext<readonly number[] | null>(null);
