import { describe, expect, it, vi } from 'vitest';
import { createGhmAuthClient } from './ghm-auth-client';
import {
  REFRESH_TOKEN_STORAGE_KEY,
  SESSION_META_STORAGE_KEY,
  createBrowserAuthSessionStore,
  type AuthSessionStore,
} from './session';

const tokenBundle = (suffix: string) => ({
  accessToken: `access-${suffix}`,
  refreshToken: `refresh-${suffix}`,
  tokenType: 'Bearer' as const,
  expiresIn: 900,
  sessionId: 10 + suffix.length,
  accountId: 42,
});

const createMemoryStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
  };
};

const createStore = (): AuthSessionStore => createBrowserAuthSessionStore(createMemoryStorage());

describe('GHM auth session store', () => {
  it('keeps access token in memory and refresh token in session storage', () => {
    const storage = createMemoryStorage();
    const store = createBrowserAuthSessionStore(storage);

    store.setAccessToken('access-a');
    store.setRefreshToken('refresh-a');
    store.setSessionMeta({ accountId: 1, sessionId: 2, expiresIn: 900 });

    expect(store.getAccessToken()).toBe('access-a');
    expect(storage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBe('refresh-a');
    expect(storage.getItem(SESSION_META_STORAGE_KEY)).toContain('"accountId":1');
    expect(storage.getItem('ghm.accessToken')).toBeNull();
  });

  it('clear removes access token and sessionStorage entries', () => {
    const storage = createMemoryStorage();
    const store = createBrowserAuthSessionStore(storage);
    store.setAccessToken('access-a');
    store.setRefreshToken('refresh-a');
    store.setSessionMeta({ accountId: 1, sessionId: 2, expiresIn: 900 });

    store.clear();

    expect(store.getAccessToken()).toBeNull();
    expect(store.getRefreshToken()).toBeNull();
    expect(store.getSessionMeta()).toBeNull();
  });
});

describe('GHM auth client', () => {
  it('login stores access in memory and refresh in session storage', async () => {
    const store = createStore();
    const fetchImpl = vi.fn(async () =>
      Response.json(tokenBundle('login'), { status: 200 }),
    );

    const client = createGhmAuthClient({
      baseUrl: 'https://ghm-internal-runtime.onrender.com',
      store,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.login('founder@example.com', 'secret');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const loginCall = fetchImpl.mock.calls[0];
    expect(loginCall).toBeDefined();
    const [url, init] = loginCall!;
    expect(url).toBe('https://ghm-internal-runtime.onrender.com/api/v1/auth/login');
    expect(JSON.parse(String((init as RequestInit | undefined)?.body))).toEqual({
      email: 'founder@example.com',
      password: 'secret',
    });
    expect(store.getAccessToken()).toBe('access-login');
    expect(store.getRefreshToken()).toBe('refresh-login');
    expect(client.getAccountId()).toBe(42);
  });

  it('authenticated profile request sends Bearer access token', async () => {
    const store = createStore();
    store.setAccessToken('access-live');
    store.setRefreshToken('refresh-live');
    store.setSessionMeta({ accountId: 42, sessionId: 7, expiresIn: 900 });

    const fetchImpl = vi.fn(async () =>
      Response.json(
        {
          profile: {
            id: 42,
            fullName: 'Founder',
            phone: null,
            avatarRef: null,
            role: 'business',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        },
        { status: 200 },
      ),
    );

    const client = createGhmAuthClient({
      baseUrl: 'https://api.example',
      store,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const response = await client.apiFetch('/api/v1/profile');
    expect(response.status).toBe(200);
    const profileCall = fetchImpl.mock.calls[0];
    expect(profileCall).toBeDefined();
    const headers = new Headers((profileCall![1] as RequestInit | undefined)?.headers);
    expect(headers.get('Authorization')).toBe('Bearer access-live');
    const body = await response.json();
    expect(body.profile.id).toBe(42);
    expect(JSON.stringify(body)).not.toContain('access-live');
    expect(JSON.stringify(body)).not.toContain('refresh-live');
  });

  it('401 triggers exactly one refresh then retries the request', async () => {
    const store = createStore();
    store.setAccessToken('access-old');
    store.setRefreshToken('refresh-old');

    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/profile')) {
        const auth = new Headers(init?.headers).get('Authorization');
        if (auth === 'Bearer access-old') {
          return Response.json({ error: 'unauthorized' }, { status: 401 });
        }
        return Response.json({ profile: { id: 42 } }, { status: 200 });
      }
      if (url.endsWith('/api/v1/auth/refresh')) {
        return Response.json(tokenBundle('rotated'), { status: 200 });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const client = createGhmAuthClient({
      baseUrl: 'https://api.example',
      store,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const response = await client.apiFetch('/api/v1/profile');
    expect(response.status).toBe(200);
    expect(store.getAccessToken()).toBe('access-rotated');
    expect(store.getRefreshToken()).toBe('refresh-rotated');

    const profileCalls = fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/api/v1/profile'));
    const refreshCalls = fetchImpl.mock.calls.filter(([url]) => String(url).endsWith('/api/v1/auth/refresh'));
    expect(profileCalls).toHaveLength(2);
    expect(refreshCalls).toHaveLength(1);
  });

  it('refresh rotation replaces the previous refresh token', async () => {
    const store = createStore();
    store.setRefreshToken('refresh-old');

    const fetchImpl = vi.fn(async () => Response.json(tokenBundle('new'), { status: 200 }));
    const client = createGhmAuthClient({
      baseUrl: 'https://api.example',
      store,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const restored = await client.restoreSession();
    expect(restored).toBe(true);
    expect(store.getRefreshToken()).toBe('refresh-new');
    expect(store.getRefreshToken()).not.toBe('refresh-old');
    expect(store.getAccessToken()).toBe('access-new');
  });

  it('failed refresh clears session', async () => {
    const store = createStore();
    store.setRefreshToken('refresh-bad');
    store.setSessionMeta({ accountId: 42, sessionId: 3, expiresIn: 900 });

    const fetchImpl = vi.fn(async () =>
      Response.json({ error: 'unauthorized', code: 'INVALID_CREDENTIALS' }, { status: 401 }),
    );
    const client = createGhmAuthClient({
      baseUrl: 'https://api.example',
      store,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const restored = await client.restoreSession();
    expect(restored).toBe(false);
    expect(store.getAccessToken()).toBeNull();
    expect(store.getRefreshToken()).toBeNull();
    expect(store.getSessionMeta()).toBeNull();
    expect(client.isAuthenticated()).toBe(false);
  });

  it('logout clears session even when the server call fails', async () => {
    const store = createStore();
    store.setAccessToken('access-live');
    store.setRefreshToken('refresh-live');
    store.setSessionMeta({ accountId: 42, sessionId: 9, expiresIn: 900 });

    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const client = createGhmAuthClient({
      baseUrl: 'https://api.example',
      store,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.logout();
    expect(store.getAccessToken()).toBeNull();
    expect(store.getRefreshToken()).toBeNull();
    expect(client.isAuthenticated()).toBe(false);
  });

  it('does not recursively refresh after a retried request still returns 401', async () => {
    const store = createStore();
    store.setAccessToken('access-old');
    store.setRefreshToken('refresh-old');

    let refreshCount = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/v1/profile')) {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      }
      if (url.endsWith('/api/v1/auth/refresh')) {
        refreshCount += 1;
        return Response.json(tokenBundle('still-bad'), { status: 200 });
      }
      throw new Error(`unexpected url ${url}`);
    });

    const client = createGhmAuthClient({
      baseUrl: 'https://api.example',
      store,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const response = await client.apiFetch('/api/v1/profile');
    expect(response.status).toBe(401);
    expect(refreshCount).toBe(1);
  });
});
