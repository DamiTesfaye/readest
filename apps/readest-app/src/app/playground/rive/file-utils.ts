/**
 * Pure helpers for validating and describing dropped/picked Rive files.
 * Kept free of any DOM/runtime imports so it can be unit-tested in jsdom.
 */

/** A `.riv` file read into memory, ready to hand to the Rive runtime. */
export interface LoadedRiveFile {
  name: string;
  /** Size in bytes. */
  size: number;
  buffer: ArrayBuffer;
}

export class RiveFileError extends Error {}

/** Rive files start with the ASCII magic "RIVE". */
const RIVE_MAGIC = [0x52, 0x49, 0x56, 0x45]; // R I V E

/** True when the name ends in `.riv` (case-insensitive). */
export function hasRivExtension(name: string): boolean {
  return /\.riv$/i.test(name.trim());
}

/** True when the buffer begins with the Rive magic bytes. */
export function hasRiveMagic(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < RIVE_MAGIC.length) return false;
  const head = new Uint8Array(buffer, 0, RIVE_MAGIC.length);
  return RIVE_MAGIC.every((byte, i) => head[i] === byte);
}

/**
 * Validate a candidate file by name and (optional) bytes. Returns an error
 * message string when invalid, or `null` when it looks like a Rive file.
 * The magic-byte check is best-effort: not every valid `.riv` build carries
 * the marker, so a good extension alone is accepted.
 */
export function validateRiveFile(name: string, buffer?: ArrayBuffer): string | null {
  if (!hasRivExtension(name)) {
    return `"${name}" is not a .riv file.`;
  }
  if (buffer && buffer.byteLength === 0) {
    return `"${name}" is empty.`;
  }
  return null;
}

/** Human-readable byte size, e.g. "12.3 KB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
