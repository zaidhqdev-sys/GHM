import express, { type Express } from 'express';
import cors from 'cors';
import { registerAuthRoutes } from '../http/auth-router';
import type { GhmAuthService } from '../auth/ghm-auth-service';
import type { AuthPersistence } from '../auth/foundation/persistence';
import type { PasswordRecoveryService } from '../auth/password-recovery';
import type { PasswordResetService } from '../auth/password-reset';
import type { QuoteFlowMigrationResetRecoveryService } from '../migrations/quoteflow-migration-reset-recovery';
import type { QuoteFlowMigrationResetCompletionService } from '../migrations/quoteflow-migration-reset-completion';

export interface AuthIssuerAppDependencies {
  authService: GhmAuthService;
  authPersistence: AuthPersistence;
  passwordResetService: PasswordResetService;
  passwordRecoveryService?: PasswordRecoveryService;
  quoteFlowMigrationResetRecoveryService?: QuoteFlowMigrationResetRecoveryService;
  quoteFlowMigrationResetCompletionService?: QuoteFlowMigrationResetCompletionService;
}

const configuredOrigins = (): string[] => {
  const origins = (process.env.GHM_AUTH_ISSUER_CORS_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      const localDevelopmentOrigin =
        parsed.protocol === 'http:' &&
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
      if (
        parsed.origin !== origin ||
        (parsed.protocol !== 'https:' && !localDevelopmentOrigin)
      ) {
        throw new Error('invalid origin');
      }
    } catch {
      throw new Error('GHM_AUTH_ISSUER_CORS_ORIGINS must contain exact HTTPS origins (HTTP is allowed only for localhost)');
    }
  }
  return [...new Set(origins)];
};

export const createAuthIssuerApp = (
  dependencies: AuthIssuerAppDependencies,
): Express => {
  const app = express();
  app.disable('x-powered-by');

  const origins = configuredOrigins();
  if (origins.length > 0) {
    app.use(cors({
      origin: origins,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Accept', 'Content-Type', 'Authorization'],
      maxAge: 600,
    }));
  }

  app.get('/healthz', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use(express.json({ limit: '16kb' }));

  registerAuthRoutes(app, {
    authService: dependencies.authService,
    authPersistence: dependencies.authPersistence,
    passwordResetService: dependencies.passwordResetService,
    passwordRecoveryService: dependencies.passwordRecoveryService,
    quoteFlowMigrationResetRecoveryService: dependencies.quoteFlowMigrationResetRecoveryService,
    quoteFlowMigrationResetCompletionService: dependencies.quoteFlowMigrationResetCompletionService,
  });

  return app;
};
