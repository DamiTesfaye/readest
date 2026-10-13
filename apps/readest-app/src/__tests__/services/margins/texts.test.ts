import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeDatabaseService } from '@/services/database/nodeDatabaseService';
import { migrate } from '@/services/database/migrate';
import { getMigrations } from '@/services/database/migrations';
import { MarginsStore } from '@/services/margins/store';

const session = vi.hoisted(() => ({ getSession: vi.fn(), amplereadFetch: vi.fn() }));
const install = vi.hoisted(() => ({ installFetch: vi.fn() }));

vi.mock('@/services/ampleread', () => ({ installFetch: install.installFetch }));
vi.mock('@/services/ampleread/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/ampleread/auth/session')>()),
  getSession: session.getSession,
  amplereadFetch: session.amplereadFetch,
}));

import { ensureTexts, isCapped, readerTextIds, rememberMatches } from '@/services/margins/texts';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const textView = (id: string, capped: boolean, familyId = id) => ({
  id,
  familyId,
  language: 'en',
  capped,
  meta: { title: 'Meditations', author: 'Marcus Aurelius' },
});

describe('margin texts', () => {
  let store: MarginsStore;
  beforeEach(async () => {
    const db = await NodeDatabaseService.open(':memory:');
    await migrate(db, getMigrations('margins'));
    store = MarginsStore.from(db);
    session.getSession.mockResolvedValue({ tokens: {}, me: { id: 'usr_a' } });
    session.amplereadFetch.mockReset();
    install.installFetch.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('treats unknown and missing texts as capped', async () => {
    expect(await isCapped(store, null)).toBe(true);
    expect(await isCapped(store, 'txt_x')).toBe(true);
  });

  it('remembers caps and families from matches', async () => {
    await rememberMatches(store, [{ textId: 'txt_pd', familyId: 'txt_root', capped: false }]);
    expect(await isCapped(store, 'txt_pd')).toBe(false);
    expect((await store.getText('txt_pd'))?.familyId).toBe('txt_root');
  });

  it('fetches text info once and stores cap, family and title', async () => {
    session.amplereadFetch.mockResolvedValue(json(200, textView('txt_9', false, 'txt_root')));
    await ensureTexts(store, ['txt_9', 'txt_9']);
    await ensureTexts(store, ['txt_9']);
    expect(session.amplereadFetch.mock.calls.map((c) => c[0])).toEqual(['/v1/texts/txt_9']);
    expect(await store.getText('txt_9')).toMatchObject({
      capped: false,
      familyId: 'txt_root',
      title: 'Meditations',
      author: 'Marcus Aurelius',
    });
  });

  it('uses the install token when signed out', async () => {
    session.getSession.mockResolvedValue(null);
    install.installFetch.mockResolvedValue(json(200, textView('txt_9', true)));
    await ensureTexts(store, ['txt_9']);
    expect(install.installFetch).toHaveBeenCalledWith('/v1/texts/txt_9');
    expect(session.amplereadFetch).not.toHaveBeenCalled();
    expect(await isCapped(store, 'txt_9')).toBe(true);
  });

  it('stores nothing on a 404 or a network error and does not throw', async () => {
    session.amplereadFetch
      .mockResolvedValueOnce(json(404, { error: 'not_found' }))
      .mockRejectedValueOnce(new TypeError('offline'));
    await ensureTexts(store, ['txt_gone', 'txt_offline']);
    expect(await store.getText('txt_gone')).toBeNull();
    expect(await store.getText('txt_offline')).toBeNull();
  });

  it('returns the text and its family for the reader', async () => {
    expect(await readerTextIds(store, null)).toEqual([]);
    expect(await readerTextIds(store, 'txt_alone')).toEqual(['txt_alone']);
    await rememberMatches(store, [
      { textId: 'txt_v1', familyId: 'txt_v1', capped: true },
      { textId: 'txt_v2', familyId: 'txt_v1', capped: true },
    ]);
    expect((await readerTextIds(store, 'txt_v2')).sort()).toEqual(['txt_v1', 'txt_v2']);
  });
});
