import { AMPLEREAD_WEB_BASE_URL } from '@/services/constants';
import { writeTextToClipboard } from '@/utils/clipboard';

export const postUrl = (postId: string): string =>
  `${AMPLEREAD_WEB_BASE_URL}/m/${encodeURIComponent(postId)}`;

export const sharePost = async (postId: string): Promise<'shared' | 'copied'> => {
  const url = postUrl(postId);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ url });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
    }
  }
  await writeTextToClipboard(url);
  return 'copied';
};
