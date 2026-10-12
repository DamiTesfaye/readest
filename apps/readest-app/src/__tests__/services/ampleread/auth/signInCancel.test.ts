import { describe, expect, it, vi } from 'vitest';
import { signInWithProvider } from '@/services/ampleread/auth/signIn';

const platform = vi.hoisted(() => ({
  dispose: vi.fn(async () => {}),
}));
vi.mock('@/services/ampleread/auth/platform', () => ({
  currentPlatform: () => 'macos',
  returnToFor: async () => ({
    returnToBase: 'http://127.0.0.1:4321/auth/callback',
    dispose: platform.dispose,
  }),
  captureRedirect: () => new Promise<string>(() => {}),
}));

describe('signInWithProvider cancel', () => {
  it('rejects and frees the loopback port when the signal aborts', async () => {
    const controller = new AbortController();
    const pending = signInWithProvider('google', controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(platform.dispose).toHaveBeenCalledTimes(1);
  });
});
