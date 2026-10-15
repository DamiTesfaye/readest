import { describe, expect, it } from 'vitest';
import { defaultDisplay } from '@/services/margins/public/display';

describe('defaultDisplay', () => {
  it('defaults a play to page shape', () => {
    expect(defaultDisplay({ elements: [{ kind: 'play' }] })).toBe('shape');
    expect(defaultDisplay({ elements: [{ kind: 'note' }] })).toBe('quote');
    expect(defaultDisplay(null)).toBe('quote');
  });
});
