export const REFRESH_TOKEN_STORAGE_KEY = 'ghm.refreshToken';
export const SESSION_META_STORAGE_KEY = 'ghm.sessionMeta';

export interface SessionMeta {
  readonly accountId: number;
  readonly sessionId: number;
  readonly expiresIn: number;
}

export interface TokenBundle {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly tokenType: 'Bearer';
  readonly expiresIn: number;
  readonly sessionId: number;
  readonly accountId: number;
}

export interface AuthSessionStore {
  getAccessToken(): string | null;
  setAccessToken(token: string | null): void;
  getRefreshToken(): string | null;
  setRefreshToken(token: string | null): void;
  getSessionMeta(): SessionMeta | null;
  setSessionMeta(meta: SessionMeta | null): void;
  clear(): void;
}

/**
 * Access token: process memory only.
 * Refresh token + non-secret session meta: sessionStorage.
 * Never uses localStorage.
 */
export const createBrowserAuthSessionStore = (
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = sessionStorage,
): AuthSessionStore => {
  let accessToken: string | null = null;

  const readMeta = (): SessionMeta | null => {
    const raw = storage.getItem(SESSION_META_STORAGE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<SessionMeta>;
      if (
        typeof parsed.accountId !== 'number' ||
        typeof parsed.sessionId !== 'number' ||
        typeof parsed.expiresIn !== 'number'
      ) {
        return null;
      }
      return {
        accountId: parsed.accountId,
        sessionId: parsed.sessionId,
        expiresIn: parsed.expiresIn,
      };
    } catch {
      return null;
    }
  };

  return {
    getAccessToken: () => accessToken,
    setAccessToken: (token) => {
      accessToken = token;
    },
    getRefreshToken: () => storage.getItem(REFRESH_TOKEN_STORAGE_KEY),
    setRefreshToken: (token) => {
      if (token === null) {
        storage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
        return;
      }
      storage.setItem(REFRESH_TOKEN_STORAGE_KEY, token);
    },
    getSessionMeta: readMeta,
    setSessionMeta: (meta) => {
      if (meta === null) {
        storage.removeItem(SESSION_META_STORAGE_KEY);
        return;
      }
      storage.setItem(SESSION_META_STORAGE_KEY, JSON.stringify(meta));
    },
    clear: () => {
      accessToken = null;
      storage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
      storage.removeItem(SESSION_META_STORAGE_KEY);
    },
  };
};

export const applyTokenBundle = (store: AuthSessionStore, tokens: TokenBundle): void => {
  store.setAccessToken(tokens.accessToken);
  store.setRefreshToken(tokens.refreshToken);
  store.setSessionMeta({
    accountId: tokens.accountId,
    sessionId: tokens.sessionId,
    expiresIn: tokens.expiresIn,
  });
};
