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
import { assertAuthIssuerDatabasePrivileges } from './database-privileges';

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
  readinessCheck: async () => { await pool.query('SELECT 1'); },
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

  const privileges = await pool.query<{
    schema_usage: boolean;
    schema_create: boolean;
    direct_relation_privileges: boolean;
    executable_functions: string[];
    expected_functions: string[];
    unsafe_function_defaults: boolean;
    runtime_executable_auth_functions: string[];
    expected_runtime_auth_functions: string[];
  }>(`
    WITH expected_signatures(signature) AS (
      SELECT unnest(ARRAY[
        'ghm.auth_create_account(text, text, text, text, text, integer, integer, integer)',
        'ghm.auth_lookup_password_by_normalized_email(text)',
        'ghm.auth_rehash_password_if_unchanged(bigint, text, text, integer, integer, integer)',
        'ghm.auth_create_session_with_refresh(bigint, bytea)',
        'ghm.auth_rotate_refresh(bytea, bytea)',
        'ghm.auth_revoke_by_refresh_hash(bytea, text)',
        'ghm.auth_issue_recovery(bigint, bytea, timestamptz)',
        'ghm.auth_reset_password_with_recovery(bytea, text, text, integer, integer, integer)',
        'ghm.auth_lookup_quoteflow_migration_reset_enrollment(text)',
        'ghm.auth_complete_quoteflow_migration_reset(bytea, text, integer, integer, integer)'
      ]::text[])
    ),

    SELECT
      has_schema_privilege(session_user, 'ghm', 'USAGE') AS schema_usage,
      has_schema_privilege(session_user, 'ghm', 'CREATE') AS schema_create,
      (
        EXISTS (
          SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                               ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(privilege)
           WHERE n.nspname = 'ghm'
             AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
             AND has_table_privilege(session_user, c.oid, p.privilege)
        )
        OR EXISTS (
          SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS p(privilege)
           WHERE n.nspname = 'ghm'
             AND c.relkind = 'S'
             AND has_sequence_privilege(session_user, c.oid, p.privilege)
        )
      ) AS direct_relation_privileges,
      ARRAY(
        SELECT p.oid::regprocedure::text
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'ghm'
           AND has_function_privilege(session_user, p.oid, 'EXECUTE')
         ORDER BY 1
      ) AS executable_functions,
      ARRAY(
        SELECT signature::regprocedure::text
          FROM expected_signatures
         ORDER BY 1
      ) AS expected_functions,
      (
        NOT EXISTS (
          SELECT 1
            FROM pg_default_acl d
           WHERE d.defaclrole = 'ghm_schema_owner'::regrole
             AND d.defaclnamespace = 0
             AND d.defaclobjtype = 'f'
        )
        OR EXISTS (
          SELECT 1
            FROM pg_default_acl d
            CROSS JOIN LATERAL aclexplode(d.defaclacl) acl
           WHERE d.defaclrole = 'ghm_schema_owner'::regrole
             AND d.defaclnamespace = 0
             AND d.defaclobjtype = 'f'
             AND acl.privilege_type = 'EXECUTE'
             AND acl.grantee IN (0, 'ghm_runtime'::regrole::oid, 'ghm_auth_issuer'::regrole::oid)
        )
      ) AS unsafe_function_defaults,
      ARRAY(
        SELECT p.oid::regprocedure::text
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'ghm'
           AND left(p.proname, 5) = 'auth_'
           AND has_function_privilege('ghm_runtime', p.oid, 'EXECUTE')
         ORDER BY 1
      ) AS runtime_executable_auth_functions,
      ARRAY(
        SELECT signature::regprocedure::text
          FROM unnest(ARRAY[
            'ghm.auth_lookup_external_identity(text, text)',
            'ghm.auth_link_business_external_mapping(text, text, bigint)',
            'ghm.auth_lookup_business_external_mapping(text, text)'
          ]::text[]) AS expected(signature)
         ORDER BY 1
      ) AS expected_runtime_auth_functions
  `);
  const databasePrivileges = privileges.rows[0];
  if (!databasePrivileges) throw new Error('Authentication Issuer database privileges could not be resolved');
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
