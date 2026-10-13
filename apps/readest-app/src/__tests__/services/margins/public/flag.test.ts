import { beforeEach, describe, expect, it, vi } from 'vitest';

const install = vi.hoisted(() => ({ installFetch: vi.fn() }));

vi.mock('@/services/ampleread', () => ({
  getApiBase: () => 'https://api.test',
  installFetch: install.installFetch,
}));

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

const loadFlag = async () => {
  vi.resetModules();
  return import('@/services/margins/public/flag');
};

beforeEach(() => vi.clearAllMocks());

describe('marginsPublicEnabled', () => {
  it('is true only when bootstrap reports marginsPublic true', async () => {
    install.installFetch.mockResolvedValue(json({ features: { marginsPublic: true } }));
    expect(await (await loadFlag()).marginsPublicEnabled()).toBe(true);
    expect(install.installFetch).toHaveBeenCalledWith('/v1/bootstrap');
    install.installFetch.mockResolvedValue(json({ features: { marginsPublic: 'yes' } }));
    expect(await (await loadFlag()).marginsPublicEnabled()).toBe(false);
    install.installFetch.mockResolvedValue(json({ features: {} }));
    expect(await (await loadFlag()).marginsPublicEnabled()).toBe(false);
  });

  it('is cached for the session', async () => {
    install.installFetch.mockResolvedValue(json({ features: { marginsPublic: true } }));
    const { marginsPublicEnabled } = await loadFlag();
    await marginsPublicEnabled();
    expect(await marginsPublicEnabled()).toBe(true);
    expect(install.installFetch).toHaveBeenCalledTimes(1);
  });

  it('is false on a network error', async () => {
    install.installFetch.mockRejectedValue(new TypeError('offline'));
    expect(await (await loadFlag()).marginsPublicEnabled()).toBe(false);
  });
});
