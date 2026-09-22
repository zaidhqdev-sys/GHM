import { getApiBaseUrl } from '../api/config';
import {
  applyTokenBundle,
  type AuthSessionStore,
  type TokenBundle,
  createBrowserAuthSessionStore,
} from './session';

export class GhmAuthClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'GhmAuthClientError';
  }
}

export type AuthStateListener = () => void;

export interface GhmAuthClient {
  login(email: string, password: string): Promise<TokenBundle>;
  logout(): Promise<void>;
  restoreSession(): Promise<boolean>;
  getAccessToken(): string | null;
  getAccountId(): number | null;
  getSessionId(): number | null;
  isAuthenticated(): boolean;
  subscribe(listener: AuthStateListener): () => void;
  apiFetch(path: string, init?: RequestInit): Promise<Response>;
}

interface GhmAuthClientOptions {
  readonly baseUrl?: string;
  readonly store?: AuthSessionStore;
  readonly fetchImpl?: typeof fetch;
}

const parseTokenBundle = (body: unknown): TokenBundle | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (
    typeof value.accessToken !== 'string' ||
    typeof value.refreshToken !== 'string' ||
    value.tokenType !== 'Bearer' ||
    typeof value.expiresIn !== 'number' ||
    typeof value.sessionId !== 'number' ||
    typeof value.accountId !== 'number'
  ) {
    return null;
  }
  return {
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    tokenType: 'Bearer',
    expiresIn: value.expiresIn,
    sessionId: value.sessionId,
    accountId: value.accountId,
  };
};

const readErrorCode = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { code?: unknown; error?: unknown };
    if (typeof body.code === 'string') return body.code;
    if (typeof body.error === 'string') return body.error;
  } catch {
    // ignore non-JSON bodies
  }
  return 'request_failed';
};

export const createGhmAuthClient = (options: GhmAuthClientOptions = {}): GhmAuthClient => {
  const baseUrl = (options.baseUrl ?? getApiBaseUrl()).replace(/\/$/, '');
  const store = options.store ?? createBrowserAuthSessionStore();
  const fetchImpl = options.fetchImpl ?? fetch;
  const listeners = new Set<AuthStateListener>();

  let refreshInFlight: Promise<boolean> | null = null;

  const notify = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const clearAuth = (): void => {
    store.clear();
    notify();
  };

  const acceptTokens = (tokens: TokenBundle): void => {
    applyTokenBundle(store, tokens);
    notify();
  };

  const postJson = async (path: string, body: unknown): Promise<Response> =>
    fetchImpl(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  const refreshOnce = async (): Promise<boolean> => {
    if (refreshInFlight) {
      return refreshInFlight;
    }

    refreshInFlight = (async (): Promise<boolean> => {
      const refreshToken = store.getRefreshToken();
      if (!refreshToken) {
        clearAuth();
        return false;
      }

      try {
        const response = await postJson('/api/v1/auth/refresh', { refreshToken });
        if (!response.ok) {
          clearAuth();
          return false;
        }
        const tokens = parseTokenBundle(await response.json());
        if (!tokens) {
          clearAuth();
          return false;
        }
        acceptTokens(tokens);
        return true;
      } catch {
        clearAuth();
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();

    return refreshInFlight;
  };

  const login = async (email: string, password: string): Promise<TokenBundle> => {
    const response = await postJson('/api/v1/auth/login', { email, password });
    if (!response.ok) {
      const code = await readErrorCode(response);
      if (response.status === 401 || code === 'INVALID_CREDENTIALS' || code === 'unauthorized') {
        throw new GhmAuthClientError('Invalid email or password', 'INVALID_CREDENTIALS', response.status);
      }
      throw new GhmAuthClientError('Login failed', code, response.status);
    }
    const tokens = parseTokenBundle(await response.json());
    if (!tokens) {
      throw new GhmAuthClientError('Login response was invalid', 'invalid_response', response.status);
    }
    acceptTokens(tokens);
    return tokens;
  };

  const logout = async (): Promise<void> => {
    const refreshToken = store.getRefreshToken();
    try {
      if (refreshToken) {
        await postJson('/api/v1/auth/logout', { refreshToken });
      }
    } catch {
      // Always clear local state regardless of server outcome.
    } finally {
      clearAuth();
    }
  };

  const restoreSession = async (): Promise<boolean> => {
    if (store.getAccessToken()) {
      return true;
    }
    if (!store.getRefreshToken()) {
      return false;
    }
    return refreshOnce();
  };

  const apiFetch = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const run = async (accessToken: string | null, allowRefresh: boolean): Promise<Response> => {
      const headers = new Headers(init.headers);
      if (!headers.has('Accept')) {
        headers.set('Accept', 'application/json');
      }
      if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
      }

      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers,
      });

      if (response.status !== 401 || !allowRefresh) {
        return response;
      }

      const refreshed = await refreshOnce();
      if (!refreshed) {
        return response;
      }

      return run(store.getAccessToken(), false);
    };

    let accessToken = store.getAccessToken();
    if (!accessToken && store.getRefreshToken()) {
      const refreshed = await refreshOnce();
      if (!refreshed) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      accessToken = store.getAccessToken();
    }

    return run(accessToken, true);
  };

  return {
    login,
    logout,
    restoreSession,
    getAccessToken: () => store.getAccessToken(),
    getAccountId: () => store.getSessionMeta()?.accountId ?? null,
    getSessionId: () => store.getSessionMeta()?.sessionId ?? null,
    isAuthenticated: () => store.getAccessToken() !== null,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    apiFetch,
  };
};
