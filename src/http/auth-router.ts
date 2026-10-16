import type { Express, Request, Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AuthTokenResponse, GhmAuthService } from '../auth/ghm-auth-service';
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

const WEB_REFRESH_COOKIE = 'ghm_web_refresh';
const WEB_REFRESH_COOKIE_PATH = '/api/ghm';

interface WebAuthConfig {
  readonly allowedOrigins: ReadonlySet<string>;
  readonly cookieName: string;
  readonly cookiePath: string;
  readonly secureCookie: boolean;
}

const getWebAuthConfig = (): WebAuthConfig => {
  const allowedOrigins = (process.env.GHM_WEB_AUTH_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const cookieName = process.env.GHM_WEB_AUTH_COOKIE_NAME?.trim() || WEB_REFRESH_COOKIE;
  const cookiePath = process.env.GHM_WEB_AUTH_COOKIE_PATH?.trim() || WEB_REFRESH_COOKIE_PATH;
  return {
    allowedOrigins: new Set(allowedOrigins),
    cookieName,
    cookiePath: cookiePath.startsWith('/') && !cookiePath.includes(';') ? cookiePath : WEB_REFRESH_COOKIE_PATH,
    secureCookie: process.env.GHM_WEB_AUTH_COOKIE_SECURE === 'true'
      || (process.env.NODE_ENV === 'production' && process.env.GHM_WEB_AUTH_COOKIE_SECURE !== 'false'),
  };
};

const requireWebAuthOrigin = (req: Request, res: Response, config: WebAuthConfig): boolean => {
  const origin = req.header('origin');
  if (config.allowedOrigins.size === 0) {
    res.status(503).json({ error: 'web_auth_not_configured' });
    return false;
  }
  if (!origin || !config.allowedOrigins.has(origin)) {
    res.status(403).json({ error: 'origin_not_allowed' });
    return false;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
  return true;
};

const readCookie = (req: Request, name: string): string | null => {
  const header = req.header('cookie');
  if (!header) return null;
  for (const item of header.split(';')) {
    const separator = item.indexOf('=');
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
    const value = item.slice(separator + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
};

const setWebRefreshCookie = (res: Response, config: WebAuthConfig, token: string): void => {
  const attributes = [
    `${config.cookieName}=${encodeURIComponent(token)}`,
    `Path=${config.cookiePath}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (config.secureCookie) attributes.push('Secure');
  res.setHeader('Set-Cookie', attributes.join('; '));
};

const clearWebRefreshCookie = (res: Response, config: WebAuthConfig): void => {
  const attributes = [
    `${config.cookieName}=`,
    `Path=${config.cookiePath}`,
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (config.secureCookie) attributes.push('Secure');
  res.setHeader('Set-Cookie', attributes.join('; '));
};

const webAccessPayload = (tokens: AuthTokenResponse) => ({
  accessToken: tokens.accessToken,
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
      authService = createGhmAuthService();
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

  // Browser session contract: refresh credentials are only held in HttpOnly cookies.
  // Access JWTs remain short-lived and are returned for in-memory use by the SPA.
  // The frontend must call these routes through its same-origin /api/ghm proxy.
  const webConfig = getWebAuthConfig();
  app.post('/api/v1/auth/web/register', loginRateLimit, async (req: Request, res: Response) => {
    if (!requireWebAuthOrigin(req, res, getWebAuthConfig())) return;
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
      setWebRefreshCookie(res, webConfig, tokens.refreshToken);
      res.status(201).json(webAccessPayload(tokens));
    } catch (error) {
      handleAuthError(error, res);
    }
  });

  app.post('/api/v1/auth/web/login', loginRateLimit, async (req: Request, res: Response) => {
    if (!requireWebAuthOrigin(req, res, getWebAuthConfig())) return;
    try {
      const input = parseLoginBody(req.body);
      if (!input) {
        res.status(400).json({ error: 'invalid_request' });
        return;
      }
      const tokens = await getAuthService().login(input.email, input.password);
      setWebRefreshCookie(res, webConfig, tokens.refreshToken);
      res.status(200).json(webAccessPayload(tokens));
    } catch (error) {
      handleAuthError(error, res);
    }
  });

  app.post('/api/v1/auth/web/refresh', refreshRateLimit, async (req: Request, res: Response) => {
    if (!requireWebAuthOrigin(req, res, getWebAuthConfig())) return;
    const refreshToken = readCookie(req, getWebAuthConfig().cookieName);
    if (!refreshToken) {
      clearWebRefreshCookie(res, getWebAuthConfig());
      res.status(401).json({ error: 'unauthorized', code: 'INVALID_REFRESH_CREDENTIAL' });
      return;
    }
    try {
      const tokens = await getAuthService().refresh(refreshToken);
      setWebRefreshCookie(res, getWebAuthConfig(), tokens.refreshToken);
      res.status(200).json(webAccessPayload(tokens));
    } catch (error) {
      clearWebRefreshCookie(res, getWebAuthConfig());
      handleAuthError(error, res);
    }
  });

  app.post('/api/v1/auth/web/logout', async (req: Request, res: Response) => {
    const config = getWebAuthConfig();
    if (!requireWebAuthOrigin(req, res, config)) return;
    const refreshToken = readCookie(req, config.cookieName);
    if (!refreshToken) {
      clearWebRefreshCookie(res, config);
      res.status(200).json({ ok: true });
      return;
    }
    try {
      await getAuthService().logout(refreshToken);
      clearWebRefreshCookie(res, config);
      res.status(200).json({ ok: true });
    } catch (error) {
      clearWebRefreshCookie(res, config);
      handleAuthError(error, res);
    }
  });
};
