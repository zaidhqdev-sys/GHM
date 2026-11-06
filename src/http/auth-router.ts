import type { Express, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AuthTokenResponse, GhmAuthService } from '../auth/ghm-auth-service';
import type { AuthPersistence } from '../auth/foundation/persistence';
import type { PasswordRecoveryService } from '../auth/password-recovery';
import type { PasswordResetService } from '../auth/password-reset';
import type { QuoteFlowMigrationResetRecoveryService } from '../migrations/quoteflow-migration-reset-recovery';
import type { QuoteFlowMigrationResetCompletionService } from '../migrations/quoteflow-migration-reset-completion';

const parseRegistrationBody = (body: unknown): { fullName?: string | null; role?: 'customer' | 'business'; email: string; password: string } | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (typeof input.email !== 'string' || typeof input.password !== 'string') return null;
  if (input.fullName !== undefined && input.fullName !== null && typeof input.fullName !== 'string') return null;
  if (input.role !== undefined && input.role !== 'customer' && input.role !== 'business') return null;
  return { fullName: input.fullName === undefined ? null : input.fullName as string | null, role: input.role as 'customer' | 'business' | undefined, email: input.email, password: input.password };
};

const parseLoginBody = (body: unknown): { email: string; password: string } | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (typeof input.email !== 'string' || typeof input.password !== 'string') return null;
  return { email: input.email, password: input.password };
};

const parseRecoveryBody = (body: unknown): { email: string } | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (typeof input.email !== 'string') return null;
  return { email: input.email };
};

const parseResetBody = (body: unknown): { token: string; email: string; password: string } | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (typeof input.token !== 'string' || typeof input.email !== 'string' || typeof input.password !== 'string') return null;
  return { token: input.token, email: input.email, password: input.password };
};

const parseRefreshBody = (body: unknown): { refreshToken: string } | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (typeof input.refreshToken !== 'string') return null;
  return { refreshToken: input.refreshToken };
};

const tokenPayload = (tokens: AuthTokenResponse) => ({
  accessToken: tokens.accessToken,
  refreshToken: tokens.refreshToken,
  tokenType: tokens.tokenType,
  expiresIn: tokens.expiresIn,
  sessionId: tokens.sessionId,
  accountId: tokens.accountId,
});

const handleAuthError = (error: unknown, res: Response): void => {
  // Lazy import keeps HS product test suites from loading Auth secret config at import time.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { GhmAuthServiceError } = require('../auth/ghm-auth-service') as typeof import('../auth/ghm-auth-service');
  if (error instanceof GhmAuthServiceError) {
    res.status(error.httpStatus).json({ error: 'unauthorized', code: error.code });
    return;
  }
  console.error(JSON.stringify({
    event: 'ghm_auth_http_failed',
    error: { name: error instanceof Error ? error.name : 'UnknownError' },
  }));
  res.status(500).json({ error: 'internal_error' });
};

export interface AuthRouterDependencies {
  readonly authService?: GhmAuthService;
  readonly authPersistence?: AuthPersistence;
  readonly passwordRecoveryService?: PasswordRecoveryService;
  readonly passwordResetService?: PasswordResetService;
  readonly quoteFlowMigrationResetRecoveryService?: QuoteFlowMigrationResetRecoveryService;
  readonly quoteFlowMigrationResetCompletionService?: QuoteFlowMigrationResetCompletionService;
}

export const registerAuthRoutes = (
  app: Express,
  dependencies: AuthRouterDependencies = {},
): void => {
  // Keep limiter state scoped to the registered app instance. This prevents one in-process
  // app/test fixture from consuming another fixture's authentication budget.
  const loginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: 'rate_limited' }),
  });
  const passwordRecoveryRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: 'rate_limited' }),
  });
  const refreshRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: 'rate_limited' }),
  });
  const browserLogoutRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: 'rate_limited' }),
  });
  // Lazy default: existing HS product tests createApp() without GHM Auth secrets.
  let authService = dependencies.authService;
  const passwordRecoveryService = dependencies.passwordRecoveryService;
  const passwordResetService = dependencies.passwordResetService;
  const quoteFlowMigrationResetRecoveryService = dependencies.quoteFlowMigrationResetRecoveryService;
  const quoteFlowMigrationResetCompletionService = dependencies.quoteFlowMigrationResetCompletionService;
  const getAuthService = (): GhmAuthService => {
    if (!authService) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createGhmAuthService } = require('../auth/ghm-auth-service') as typeof import('../auth/ghm-auth-service');
      authService = createGhmAuthService(dependencies.authPersistence);
    }
    return authService;
  };

  app.post('/api/v1/auth/quoteflow-migration-reset/request', passwordRecoveryRateLimit, async (req: Request, res: Response) => {
    try {
      const input = parseRecoveryBody(req.body);
      if (!input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      if (!quoteFlowMigrationResetRecoveryService) {
        res.status(503).json({ error: 'service_unavailable' });
        return;
      }
      await quoteFlowMigrationResetRecoveryService.request(input.email);
      res.status(202).json({ ok: true });
    } catch (error) {
      // Preserve migration anti-enumeration at HTTP: malformed email is a request error,
      // but unknown/ineligible migration state is intentionally indistinguishable from success.
      if (error instanceof Error && error.name === 'EmailNormalizationError') {
        res.status(202).json({ ok: true });
        return;
      }
      console.error(JSON.stringify({
        event: 'ghm_quoteflow_migration_reset_request_failed',
        error: { name: error instanceof Error ? error.name : 'UnknownError' },
      }));
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.post('/api/v1/auth/quoteflow-migration-reset/complete', passwordRecoveryRateLimit, async (req: Request, res: Response) => {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const input = req.body as Record<string, unknown>;
      if (typeof input.token !== 'string' || typeof input.password !== 'string' || !input.token || !input.password) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      if (!quoteFlowMigrationResetCompletionService) {
        res.status(503).json({ error: 'service_unavailable' });
        return;
      }
      const completed = await quoteFlowMigrationResetCompletionService.complete(input.token, input.password);
      // Session issuance happens only after the atomic migration reset transaction commits.
      const tokens = await getAuthService().login(completed.loginEmail, input.password);
      res.status(200).json(tokenPayload(tokens));
    } catch (error) {
      if (error instanceof Error && (error as { code?: string }).code === 'RECOVERY_CREDENTIAL_INVALID') {
        res.status(400).json({ error: 'invalid_recovery' });
        return;
      }
      console.error(JSON.stringify({
        event: 'ghm_quoteflow_migration_reset_complete_failed',
        error: { name: error instanceof Error ? error.name : 'UnknownError' },
      }));
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.post('/api/v1/auth/password-recovery/request', passwordRecoveryRateLimit, async (req: Request, res: Response) => {
    try {
      const input = parseRecoveryBody(req.body);
      if (!input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      if (!passwordRecoveryService) {
        res.status(503).json({ error: 'service_unavailable' });
        return;
      }
      await passwordRecoveryService.request(input.email);
      res.status(202).json({ ok: true });
    } catch (error) {
      console.error(JSON.stringify({
        event: 'ghm_password_recovery_delivery_failed',
        error: { name: error instanceof Error ? error.name : 'UnknownError' },
      }));
      res.status(500).json({ error: 'internal_error' });
    }
  });


  app.post('/api/v1/auth/password-recovery/reset', passwordRecoveryRateLimit, async (req: Request, res: Response) => {
    try {
      const input = parseResetBody(req.body);
      if (!input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      if (!passwordResetService) {
        res.status(503).json({ error: 'service_unavailable' });
        return;
      }
      await passwordResetService.reset(input.token, input.email, input.password);
      res.status(200).json({ ok: true });
    } catch (error) {
      if (error instanceof Error && (error as { code?: string }).code === 'RECOVERY_CREDENTIAL_INVALID') {
        res.status(400).json({ error: 'invalid_recovery' });
        return;
      }
      console.error(JSON.stringify({
        event: 'ghm_password_reset_failed',
        error: { name: error instanceof Error ? error.name : 'UnknownError' },
      }));
      res.status(500).json({ error: 'internal_error' });
    }
  });

  app.post('/api/v1/auth/register', loginRateLimit, async (req: Request, res: Response) => {
    try {
      const input = parseRegistrationBody(req.body);
      if (!input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const service = getAuthService();
      if (!service.register) {
        res.status(503).json({ error: 'service_unavailable' });
        return;
      }
      const tokens = await service.register(input);
      res.status(201).json(tokenPayload(tokens));
    } catch (error) {
      handleAuthError(error, res);
    }
  });

  app.post('/api/v1/auth/login', loginRateLimit, async (req: Request, res: Response) => {
    try {
      const input = parseLoginBody(req.body);
      if (!input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const tokens = await getAuthService().login(input.email, input.password);
      res.status(200).json(tokenPayload(tokens));
    } catch (error) {
      handleAuthError(error, res);
    }
  });

  app.post('/api/v1/auth/refresh', refreshRateLimit, async (req: Request, res: Response) => {
    try {
      const input = parseRefreshBody(req.body);
      if (!input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const tokens = await getAuthService().refresh(input.refreshToken);
      res.status(200).json(tokenPayload(tokens));
    } catch (error) {
      handleAuthError(error, res);
    }
  });

  app.post('/api/v1/auth/logout', async (req: Request, res: Response) => {
    try {
      const input = parseRefreshBody(req.body);
      if (!input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      await getAuthService().logout(input.refreshToken);
      res.status(200).json({ ok: true });
    } catch (error) {
      handleAuthError(error, res);
    }
  });
  // Browser-only contract for the same-origin Connect BFF. Keep native bearer-token
  // routes above unchanged: server clients continue sending refreshToken in JSON.
  const browserCookieName = 'zaid_connect_refresh';
  const readBrowserCookie = (req: Request): string | null => {
    const raw = req.headers.cookie;
    if (typeof raw !== 'string' || raw.length > 8192) return null;
    for (const part of raw.split(';')) {
      const separator = part.indexOf('=');
      if (separator < 0 || part.slice(0, separator).trim() !== browserCookieName) continue;
      const value = part.slice(separator + 1).trim();
      try {
        const decoded = decodeURIComponent(value);
        return decoded.length > 0 && decoded.length <= 4096 ? decoded : null;
      } catch { return null; }
    }
    return null;
  };
  const getBrowserCookieConfig = (): { origins: Set<string>; path: string; maxAge: number } | null => {
    const origins = (process.env.GHM_WEB_AUTH_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean);
    const path = process.env.GHM_WEB_AUTH_COOKIE_PATH;
    const maxAge = Number(process.env.GHM_WEB_AUTH_COOKIE_MAX_AGE_SECONDS);
    if (
      origins.length === 0 ||
      origins.some((value) => {
        try {
          const parsed = new URL(value);
          return parsed.origin !== value || (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1');
        } catch { return true; }
      }) ||
      path !== '/api/ghm' ||
      !Number.isSafeInteger(maxAge) || maxAge < 60 || maxAge > 2_592_000
    ) return null;
    return { origins: new Set(origins), path, maxAge };
  };
  const browserCookieHeader = (token: string | null, config: { path: string; maxAge: number }): string => {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const value = token
      ? `${browserCookieName}=${encodeURIComponent(token)}; Max-Age=${config.maxAge}`
      : `${browserCookieName}=; Max-Age=0`;
    return `${value}; Path=${config.path}; HttpOnly; SameSite=Lax${secure}`;
  };
  const requireBrowserOrigin = (req: Request, res: Response, next: import('express').NextFunction): void => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    const config = getBrowserCookieConfig();
    if (!config) {
      res.status(503).json({ error: 'browser_auth_not_configured' });
      return;
    }
    const origin = req.headers.origin;
    if (typeof origin !== 'string' || !config.origins.has(origin)) {
      res.status(403).json({ error: 'origin_not_allowed' });
      return;
    }
    next();
  };
  const accessOnlyPayload = (tokens: AuthTokenResponse) => ({
    accessToken: tokens.accessToken,
    tokenType: tokens.tokenType,
    expiresIn: tokens.expiresIn,
    sessionId: tokens.sessionId,
    accountId: tokens.accountId,
  });

  app.post('/api/v1/auth/web/register', requireBrowserOrigin, loginRateLimit, async (req: Request, res: Response) => {
    try {
      const input = parseRegistrationBody(req.body);
      if (!input) { res.status(400).json({ error: 'invalid_request' }); return; }
      const service = getAuthService();
      if (!service.register) { res.status(503).json({ error: 'service_unavailable' }); return; }
      const tokens = await service.register(input);
      const config = getBrowserCookieConfig();
      if (!config) { res.status(503).json({ error: 'browser_auth_not_configured' }); return; }
      res.setHeader('Set-Cookie', browserCookieHeader(tokens.refreshToken, config));
      res.status(201).json(accessOnlyPayload(tokens));
    } catch (error) { handleAuthError(error, res); }
  });

  app.post('/api/v1/auth/web/login', requireBrowserOrigin, loginRateLimit, async (req: Request, res: Response) => {
    try {
      const input = parseLoginBody(req.body);
      if (!input) { res.status(400).json({ error: 'invalid_request' }); return; }
      const tokens = await getAuthService().login(input.email, input.password);
      const config = getBrowserCookieConfig();
      if (!config) { res.status(503).json({ error: 'browser_auth_not_configured' }); return; }
      res.setHeader('Set-Cookie', browserCookieHeader(tokens.refreshToken, config));
      res.status(200).json(accessOnlyPayload(tokens));
    } catch (error) { handleAuthError(error, res); }
  });

  app.post('/api/v1/auth/web/refresh', requireBrowserOrigin, refreshRateLimit, async (req: Request, res: Response) => {
    const config = getBrowserCookieConfig();
    if (!config) { res.status(503).json({ error: 'browser_auth_not_configured' }); return; }
    const refreshToken = readBrowserCookie(req);
    if (!refreshToken) {
      res.setHeader('Set-Cookie', browserCookieHeader(null, config));
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    try {
      const tokens = await getAuthService().refresh(refreshToken);
      res.setHeader('Set-Cookie', browserCookieHeader(tokens.refreshToken, config));
      res.status(200).json(accessOnlyPayload(tokens));
    } catch (error) {
      res.setHeader('Set-Cookie', browserCookieHeader(null, config));
      handleAuthError(error, res);
    }
  });

  app.post('/api/v1/auth/web/logout', requireBrowserOrigin, browserLogoutRateLimit, async (req: Request, res: Response) => {
    const config = getBrowserCookieConfig();
    if (!config) { res.status(503).json({ error: 'browser_auth_not_configured' }); return; }
    const refreshToken = readBrowserCookie(req);
    let revocationFailed = false;
    try {
      if (refreshToken) await getAuthService().logout(refreshToken);
    } catch (error) {
      revocationFailed = true;
      console.error(JSON.stringify({
        event: 'ghm_browser_auth_logout_failed',
        error: { name: error instanceof Error ? error.name : 'UnknownError' },
      }));
    } finally {
      // Always remove the browser's cookie, but don't claim server-side revocation
      // succeeded when the auth persistence layer reported a failure.
      res.setHeader('Set-Cookie', browserCookieHeader(null, config));
    }
    if (revocationFailed) {
      res.status(503).json({ error: 'logout_revocation_unavailable' });
      return;
    }
    res.status(200).json({ ok: true });
  });

};
