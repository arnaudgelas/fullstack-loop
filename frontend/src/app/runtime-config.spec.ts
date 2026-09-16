import { describe, expect, it, vi } from 'vitest';
import { RUNTIME_CONFIG_URL, loadRuntimeConfig, parseRuntimeConfig } from './runtime-config';

const jsonResponse = (body: unknown, ok = true): Response =>
  ({ ok, json: () => Promise.resolve(body) }) as unknown as Response;

describe('parseRuntimeConfig', () => {
  it('reads a well-formed payload', () => {
    expect(parseRuntimeConfig({ apiBasePath: '/gateway', token: 'a.b.c' })).toEqual({
      apiBasePath: '/gateway',
      token: 'a.b.c',
    });
  });

  it('defaults to same-origin with no token', () => {
    expect(parseRuntimeConfig({})).toEqual({ apiBasePath: '', token: null });
  });

  it('treats the un-substituted placeholder case (empty strings) as absent', () => {
    expect(parseRuntimeConfig({ apiBasePath: '', token: '' })).toEqual({
      apiBasePath: '',
      token: null,
    });
  });

  it.each([null, undefined, 42, 'nope', []])('survives a junk payload: %s', (payload) => {
    expect(parseRuntimeConfig(payload)).toEqual({ apiBasePath: '', token: null });
  });

  it('ignores non-string fields', () => {
    expect(parseRuntimeConfig({ apiBasePath: 7, token: { a: 1 } })).toEqual({
      apiBasePath: '',
      token: null,
    });
  });
});

describe('loadRuntimeConfig', () => {
  it('fetches the runtime config without caching it', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({ token: 'x.y.z' })));

    await expect(loadRuntimeConfig(fetchImpl)).resolves.toEqual({
      apiBasePath: '',
      token: 'x.y.z',
    });
    // Asserted against the literal, not the constant, so a mutated constant dies.
    expect(RUNTIME_CONFIG_URL).toBe('/config.json');
    expect(fetchImpl).toHaveBeenCalledWith('/config.json', { cache: 'no-store' });
  });

  it('falls back to the default when the file is missing', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({ token: 'x' }, false)));

    await expect(loadRuntimeConfig(fetchImpl)).resolves.toEqual({
      apiBasePath: '',
      token: null,
    });
  });

  it('falls back to the default when the fetch itself fails', async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error('offline')));

    await expect(loadRuntimeConfig(fetchImpl)).resolves.toEqual({
      apiBasePath: '',
      token: null,
    });
  });

  it('falls back to the default when the body is not JSON', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.reject(new Error('unexpected token')),
      } as unknown as Response),
    );

    await expect(loadRuntimeConfig(fetchImpl)).resolves.toEqual({
      apiBasePath: '',
      token: null,
    });
  });
});
