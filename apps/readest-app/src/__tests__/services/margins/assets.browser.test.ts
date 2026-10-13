import { describe, expect, it } from 'vitest';
import { WebDatabaseService } from '@/services/database/webDatabaseService';
import { migrate } from '@/services/database/migrate';
import { getMigrations } from '@/services/database/migrations';
import { MarginsStore } from '@/services/margins/store';
import { downscale } from '@/services/margins/assets';

const canvasFile = async (width: number, height: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')!.fillRect(0, 0, width, height);
  const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
  return new File([blob], 'art.png', { type: 'image/png' });
};

describe('margin assets on web', () => {
  it('keeps 1 MiB of base64 art across close and reopen', async () => {
    const name = `margins-asset-test-${Date.now()}`;
    const bytes = new Uint8Array(1024 * 1024).map((_, i) => (i * 31) % 256);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const data = btoa(s);
    const first = await WebDatabaseService.open(name);
    await migrate(first, getMigrations('margins'));
    await MarginsStore.from(first).putAsset({
      localId: 'local:big',
      userId: null,
      remoteId: null,
      mime: 'image/png',
      data,
      sha256: 'x',
      width: 1,
      height: 1,
      createdAt: 1,
    });
    await first.close();

    const second = await WebDatabaseService.open(name);
    await migrate(second, getMigrations('margins'));
    expect((await MarginsStore.from(second).getAsset('local:big'))?.data).toBe(data);
    await second.close();
  });

  it('downscales large rasters to 2048 px and keeps small ones', async () => {
    const big = await downscale(await canvasFile(3000, 1000));
    expect([big.width, big.height]).toEqual([2048, 683]);
    expect(big.blob.type).toBe('image/png');
    const small = await canvasFile(40, 20);
    expect(await downscale(small)).toEqual({ blob: small, width: 40, height: 20 });
  });
});
