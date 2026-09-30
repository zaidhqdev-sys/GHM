import type { Express, Request, Response } from 'express';
import type { AuthTokenResponse, GhmAuthService } from '../auth/ghm-auth-service';

const parseLoginBody = (body: unknown): { email: string; password: string } | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  if (typeof input.email !== 'string' || typeof input.password !== 'string') return null;
  return { email: input.email, password: input.password };
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
}

export const registerAuthRoutes = (
  app: Express,
  dependencies: AuthRouterDependencies = {},
): void => {
  // Lazy default: existing HS product tests createApp() without GHM Auth secrets.
  let authService = dependencies.authService;
  const getAuthService = (): GhmAuthService => {
    if (!authService) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createGhmAuthService } = require('../auth/ghm-auth-service') as typeof import('../auth/ghm-auth-service');
      authService = createGhmAuthService();
    }
    return authService;
  };

  app.post('/api/v1/auth/login', async (req: Request, res: Response) => {
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

  app.post('/api/v1/auth/refresh', async (req: Request, res: Response) => {
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
};
