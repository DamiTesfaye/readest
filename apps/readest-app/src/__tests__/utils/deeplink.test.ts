import { describe, it, expect } from 'vitest';
import { buildAnnotationUrl, parseMarginDeepLink } from '../../utils/deeplink';

describe('buildAnnotationUrl', () => {
  const link = { bookHash: 'abc', noteId: 'n1', cfi: '/6/4!/4/2' };

  it('builds the custom-scheme app URL when linkType is "app"', () => {
    const url = buildAnnotationUrl(link, 'app');
    expect(url.startsWith('readest://book/abc/annotation/n1')).toBe(true);
  });

  it('builds the HTTPS web URL when linkType is "web"', () => {
    const url = buildAnnotationUrl(link, 'web');
    expect(url.startsWith('https://')).toBe(true);
    expect(url).toContain('/o/book/abc/annotation/n1');
  });

  it('preserves the cfi query for both link types', () => {
    const encoded = encodeURIComponent(link.cfi);
    expect(buildAnnotationUrl(link, 'app')).toContain(`cfi=${encoded}`);
    expect(buildAnnotationUrl(link, 'web')).toContain(`cfi=${encoded}`);
  });

  it('omits the cfi query when no cfi is provided', () => {
    const url = buildAnnotationUrl({ bookHash: 'abc', noteId: 'n1' }, 'app');
    expect(url).toBe('readest://book/abc/annotation/n1');
  });
});

describe('parseMarginDeepLink', () => {
  const id = `pst_${'0123456789abcdef'.repeat(2)}`;

  it('accepts the app scheme and the web link', () => {
    expect(parseMarginDeepLink(`ampleread://m/${id}`)).toEqual({ postId: id });
    expect(parseMarginDeepLink(`https://web.ampleread.com/m/${id}`)).toEqual({ postId: id });
  });

  it('rejects other hosts, other paths and malformed ids', () => {
    expect(parseMarginDeepLink(`https://web.readest.com/m/${id}`)).toBeNull();
    expect(parseMarginDeepLink('ampleread://auth/callback?code=x')).toBeNull();
    expect(parseMarginDeepLink('ampleread://m/xyz')).toBeNull();
    expect(parseMarginDeepLink(`https://web.ampleread.com/s/${id}`)).toBeNull();
    expect(parseMarginDeepLink(`ampleread://m/${id}/extra`)).toBeNull();
    expect(parseMarginDeepLink('not a url')).toBeNull();
  });
});
