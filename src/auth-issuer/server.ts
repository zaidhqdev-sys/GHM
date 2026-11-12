import http from 'http';
import { Pool } from 'pg';
import { createAccessJwtService } from '../auth/foundation/access-jwt';
import { loadEs256Keys } from '../auth/foundation/es256-keys';
import { PostgresAuthPersistence } from '../auth/foundation/persistence';
import { createGhmAuthService } from '../auth/ghm-auth-service';
import { createPasswordResetService } from '../auth/password-reset';
import { createQuoteFlowMigrationResetCompletionService } from '../migrations/quoteflow-migration-reset-completion';
import { createAuthIssuerApp } from './app';
import { authIssuerDatabaseSslConfig } from './database-ssl';
import { assertAuthIssuerDatabaseIdentity } from './database-principal';
import { assertAuthIssuerDatabasePrivileges, readAuthIssuerDatabasePrivileges } from './database-privileges';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = required('GHM_AUTH_ISSUER_DATABASE_URL');
const databaseSsl = authIssuerDatabaseSslConfig(
  process.env.GHM_AUTH_ISSUER_DATABASE_SSL_MODE,
  isProduction,
);
const port = Number.parseInt(process.env.PORT ?? '10000', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseSsl,
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});
const persistence = new PostgresAuthPersistence(pool);
const authService = createGhmAuthService(
  persistence,
  createAccessJwtService(loadEs256Keys()),
);
const app = createAuthIssuerApp({
  authService,
  authPersistence: persistence,
  passwordResetService: createPasswordResetService(persistence),
  quoteFlowMigrationResetCompletionService: createQuoteFlowMigrationResetCompletionService(persistence),
  readinessCheck: async () => {
    await pool.query('SELECT 1');
    const currentPrivileges = await readAuthIssuerDatabasePrivileges(pool);
    assertAuthIssuerDatabasePrivileges(currentPrivileges);
  },
});
const server = http.createServer(app);
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;

const safeErrorDetails = (error: unknown): { name: string; code?: string } => {
  if (!(error instanceof Error)) return { name: 'UnknownError' };
  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return code ? { name: error.name, code } : { name: error.name };
};

const shutdown = async (signal: string): Promise<void> => {
  console.log(`Received ${signal}; shutting down GHM Authentication Issuer`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
};

process.once('SIGTERM', () => void shutdown('SIGTERM').finally(() => process.exit(0)));
process.once('SIGINT', () => void shutdown('SIGINT').finally(() => process.exit(0)));
process.on('uncaughtException', (error: Error) => {
  console.error(JSON.stringify({ event: 'auth_issuer_uncaught_exception', error: safeErrorDetails(error) }));
  process.exit(1);
});
process.on('unhandledRejection', (reason: unknown) => {
  console.error(JSON.stringify({ event: 'auth_issuer_unhandled_rejection', error: safeErrorDetails(reason) }));
  process.exit(1);
});

const start = async (): Promise<void> => {
  const identity = await pool.query<{
    session_user: string;
    current_user: string;
    rolcanlogin: boolean;
    rolinherit: boolean;
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
    no_role_memberships: boolean;
  }>(`
    SELECT session_user,
           current_user,
           r.rolcanlogin,
           r.rolinherit,
           r.rolsuper,
           r.rolcreatedb,
           r.rolcreaterole,
           r.rolreplication,
           r.rolbypassrls,
           NOT EXISTS (
             SELECT 1
               FROM pg_auth_members m
              WHERE m.member = r.oid OR m.roleid = r.oid
           ) AS no_role_memberships
      FROM pg_roles r
     WHERE r.rolname = session_user
  `);
  const databaseIdentity = identity.rows[0];
  if (!databaseIdentity) throw new Error('Authentication Issuer database identity could not be resolved');
  assertAuthIssuerDatabaseIdentity(databaseIdentity);
  const databasePrivileges = await readAuthIssuerDatabasePrivileges(pool);
  assertAuthIssuerDatabasePrivileges(databasePrivileges);
  server.listen(port, () => {
    console.log(`GHM Authentication Issuer listening on port ${port}`);
  });
};

void start().catch(async (error: unknown) => {
  console.error(JSON.stringify({ event: 'auth_issuer_startup_failed', error: safeErrorDetails(error) }));
  await pool.end();
  process.exitCode = 1;
});
