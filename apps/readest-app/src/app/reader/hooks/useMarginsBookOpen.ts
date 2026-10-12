import { useCallback, useEffect } from 'react';
import { useEnv } from '@/context/EnvContext';
import type { BookDoc } from '@/libs/document';
import { onMarginsBookOpen } from '@/services/margins/bookOpen';
import { useBookDataStore } from '@/store/bookDataStore';
import { useWindowActiveChanged } from './useWindowActiveChanged';

export const useMarginsBookOpen = (bookKey: string, bookDoc: BookDoc) => {
  const { appService } = useEnv();
  const book = useBookDataStore((s) => s.getBookData(bookKey)?.book);

  const open = useCallback(() => {
    if (appService && book) void onMarginsBookOpen(appService, book, bookDoc);
  }, [appService, book, bookDoc]);

  useEffect(open, [open]);

  useWindowActiveChanged(
    useCallback(
      (isActive: boolean) => {
        if (isActive) open();
      },
      [open],
    ),
  );
};
