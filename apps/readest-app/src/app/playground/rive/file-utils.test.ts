import { describe, expect, it } from 'vitest';
import { formatBytes, hasRivExtension, hasRiveMagic, validateRiveFile } from './file-utils';

function bufferFromBytes(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

describe('hasRivExtension', () => {
  it('accepts .riv regardless of case and surrounding space', () => {
    expect(hasRivExtension('hero.riv')).toBe(true);
    expect(hasRivExtension('HERO.RIV')).toBe(true);
    expect(hasRivExtension('  spaced.riv  ')).toBe(true);
  });

  it('rejects other extensions', () => {
    expect(hasRivExtension('hero.rive')).toBe(false);
    expect(hasRivExtension('hero.png')).toBe(false);
    expect(hasRivExtension('riv')).toBe(false);
  });
});

describe('hasRiveMagic', () => {
  it('detects the RIVE magic prefix', () => {
    expect(hasRiveMagic(bufferFromBytes([0x52, 0x49, 0x56, 0x45, 0x00]))).toBe(true);
  });

  it('rejects buffers without the prefix or too short', () => {
    expect(hasRiveMagic(bufferFromBytes([0x00, 0x01, 0x02, 0x03]))).toBe(false);
    expect(hasRiveMagic(bufferFromBytes([0x52, 0x49]))).toBe(false);
  });
});

describe('validateRiveFile', () => {
  it('returns null for a valid extension', () => {
    expect(validateRiveFile('hero.riv')).toBeNull();
    expect(validateRiveFile('hero.riv', bufferFromBytes([0x52, 0x49, 0x56, 0x45]))).toBeNull();
  });

  it('rejects a wrong extension', () => {
    expect(validateRiveFile('hero.png')).toMatch(/not a \.riv file/);
  });

  it('rejects an empty buffer', () => {
    expect(validateRiveFile('hero.riv', new ArrayBuffer(0))).toMatch(/empty/);
  });
});

describe('formatBytes', () => {
  it('formats across unit boundaries', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
