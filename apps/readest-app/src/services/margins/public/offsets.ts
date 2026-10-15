import type { MarginsCore } from '../marginsClient';

const isLead = (b: number) => (b & 0xc0) !== 0x80;

export const scalarAt = (bytes: Uint8Array, byte: number): number => {
  let count = 0;
  for (let i = 0; i < byte; i++) if (isLead(bytes[i]!)) count++;
  return count;
};

export const byteAt = (bytes: Uint8Array, scalar: number): number => {
  let count = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (!isLead(bytes[i]!)) continue;
    if (count === scalar) return i;
    count++;
  }
  return bytes.length;
};

const sections = new Map<string, Promise<Uint8Array>>();

export const sectionBytes = (
  core: MarginsCore,
  fileHash: string,
  section: number,
): Promise<Uint8Array> => {
  const key = `${fileHash}:${section}`;
  let bytes = sections.get(key);
  if (!bytes) {
    bytes = core.canonicalSection(fileHash, section).then((s) => new TextEncoder().encode(s.text));
    sections.set(key, bytes);
    bytes.catch(() => sections.delete(key));
  }
  return bytes;
};

export interface ScalarSpan {
  section: number;
  start: number;
  end: number;
  sectionLen: number;
}

export const toScalarSpan = async (
  core: MarginsCore,
  fileHash: string,
  section: number,
  startByte: number,
  endByte: number,
): Promise<ScalarSpan> => {
  const bytes = await sectionBytes(core, fileHash, section);
  return {
    section,
    start: scalarAt(bytes, startByte),
    end: scalarAt(bytes, endByte),
    sectionLen: scalarAt(bytes, bytes.length),
  };
};
