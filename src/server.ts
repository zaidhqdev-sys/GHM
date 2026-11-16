import http from 'http';
import { Pool } from 'pg';
import { config } from './config';
import { createApp } from './http/app';
import { pool } from './db/pool';
import { assertRuntimeDatabaseIdentity } from './db/runtime-principal';
import { assertRuntimeDatabaseFunctionPrivileges, readRuntimeDatabaseFunctionPrivileges } from './db/runtime-database-privileges';
import { authIssuerDatabaseSslConfig } from './auth-issuer/database-ssl';
import { assertAuthIssuerDatabaseIdentity } from './auth-issuer/database-principal';
import { assertAuthIssuerDatabasePrivileges, readAuthIssuerDatabasePrivileges } from './auth-issuer/database-privileges';
import { PostgresAuthPersistence } from './auth/foundation/persistence';
import { createAccessJwtService } from './auth/foundation/access-jwt';
import { loadEs256Keys } from './auth/foundation/es256-keys';
import { createGhmAuthService } from './auth/ghm-auth-service';
import { createPasswordResetService } from './auth/password-reset';
import { createQuoteFlowMigrationResetCompletionService } from './migrations/quoteflow-migration-reset-completion';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

// Authentication remains a separate least-privilege database principal, but
// runs inside the already-approved GHM Internal Runtime process.
const authPool = new Pool({
  connectionString: required('GHM_AUTH_ISSUER_DATABASE_URL'),
  ssl: authIssuerDatabaseSslConfig(
    process.env.GHM_AUTH_ISSUER_DATABASE_SSL_MODE,
    config.isProduction,
  ),
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});
const authPersistence = new PostgresAuthPersistence(authPool);
const authService = createGhmAuthService(
  authPersistence,
  createAccessJwtService(loadEs256Keys()),
);

const app = createApp({
  authRoutesEnabled: true,
  authService,
  authPersistence,
  passwordResetService: createPasswordResetService(authPersistence),
  quoteFlowMigrationResetCompletionService:
    createQuoteFlowMigrationResetCompletionService(authPersistence),
});
const server = http.createServer(app);
server.requestTimeout = 30_000;
server.headersTimeout = 10_000;
server.keepAliveTimeout = 5_000;
let ready = false;

const safeErrorDetails = (error: unknown): { name: string; code?: string } => {
  if (!(error instanceof Error)) return { name: 'UnknownError' };
  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  return code ? { name: error.name, code } : { name: error.name };
};

app.get('/readyz', (_req, res) => {
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready' });
});

const assertAuthIssuerIdentity = async (): Promise<void> => {
  const identity = await authPool.query<{
    session_user: string;
    current_user: string;
    rolcanlogin: boolean;
    rolinherit: boolean;
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
    no_untrusted_role_memberships: boolean;
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
               JOIN pg_roles member_role ON member_role.oid = m.member
              WHERE m.member = r.oid
                 OR (
                   m.roleid = r.oid
                   AND (
                     member_role.rolname <> 'ghm_db_user'
                     OR m.admin_option IS DISTINCT FROM true
                     OR m.inherit_option IS DISTINCT FROM false
                     OR m.set_option IS DISTINCT FROM false
                   )
                 )
           ) AS no_untrusted_role_memberships
      FROM pg_roles r
     WHERE r.rolname = session_user
  `);
  const databaseIdentity = identity.rows[0];
  if (!databaseIdentity) throw new Error('GHM auth database identity could not be resolved');
  assertAuthIssuerDatabaseIdentity(databaseIdentity);
  const privileges = await readAuthIssuerDatabasePrivileges(authPool);
  assertAuthIssuerDatabasePrivileges(privileges);
};

const start = async (): Promise<void> => {
  const identity = await pool.query<{
    session_user: string;
    current_user: string;
    database_connect_privilege: boolean;
    database_create_privilege: boolean;
    schema_usage: boolean;
    schema_create: boolean;
    rolcanlogin: boolean;
    rolinherit: boolean;
    rolsuper: boolean;
    rolcreatedb: boolean;
    rolcreaterole: boolean;
    rolreplication: boolean;
    rolbypassrls: boolean;
    no_untrusted_role_memberships: boolean;
  }>(`
    SELECT session_user,
           current_user,
           has_database_privilege(session_user, current_database(), 'CONNECT') AS database_connect_privilege,
           has_database_privilege(session_user, current_database(), 'CREATE') AS database_create_privilege,
           has_schema_privilege(session_user, 'ghm', 'USAGE') AS schema_usage,
           has_schema_privilege(session_user, 'ghm', 'CREATE') AS schema_create,
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
               JOIN pg_roles member_role ON member_role.oid = m.member
              WHERE m.member = r.oid
                 OR (m.roleid = r.oid AND member_role.rolname <> 'ghm_db_user')
           ) AS no_untrusted_role_memberships
      FROM pg_roles r
     WHERE r.rolname = session_user
  `);
  assertRuntimeDatabaseIdentity(identity.rows[0]);
  await assertAuthIssuerIdentity();
  if (!config.isProduction || process.env.GHM_RUNTIME_FUNCTION_ALLOWLIST_ENFORCED === 'true') {
    const functionPrivileges = await readRuntimeDatabaseFunctionPrivileges(pool);
    assertRuntimeDatabaseFunctionPrivileges(functionPrivileges);
  } else {
    console.warn(JSON.stringify({
      event: 'runtime_function_allowlist_not_enforced',
      reason: 'production_acl_baseline_not_yet_independently_qualified',
    }));
  }
  server.listen(config.port, () => {
    ready = true;
    console.log(`GHM Internal Runtime listening on port ${config.port}`);
  });
};

const shutdown = async (signal: string): Promise<void> => {
  ready = false;
  console.log(`Received ${signal}; shutting down GHM Internal Runtime`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await Promise.all([pool.end(), authPool.end()]);
};

process.once('SIGTERM', () => void shutdown('SIGTERM').finally(() => process.exit(0)));
process.once('SIGINT', () => void shutdown('SIGINT').finally(() => process.exit(0)));
process.on('uncaughtException', (error: Error) => {
  console.error(JSON.stringify({ event: 'uncaught_exception', error: safeErrorDetails(error) }));
  process.exit(1);
});
process.on('unhandledRejection', (reason: unknown) => {
  console.error(JSON.stringify({ event: 'unhandled_rejection', error: safeErrorDetails(reason) }));
  process.exit(1);
});

void start().catch(async (error: unknown) => {
  console.error(JSON.stringify({ event: 'startup_failed', error: safeErrorDetails(error) }));
  await Promise.all([pool.end(), authPool.end()]);
  process.exitCode = 1;
});
