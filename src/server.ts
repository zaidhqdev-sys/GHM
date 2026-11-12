import http from 'http';
import { config } from './config';
import { createApp } from './http/app';
import { pool } from './db/pool';
import { assertRuntimeDatabaseIdentity } from './db/runtime-principal';
import { assertRuntimeDatabaseFunctionPrivileges, readRuntimeDatabaseFunctionPrivileges } from './db/runtime-database-privileges';

const app = createApp({ authRoutesEnabled: false });
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
    no_role_memberships: boolean;
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
              WHERE m.member = r.oid OR m.roleid = r.oid
           ) AS no_role_memberships
      FROM pg_roles r
     WHERE r.rolname = session_user
  `);
  assertRuntimeDatabaseIdentity(identity.rows[0]);
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
    console.log(`GHM Core Engine listening on port ${config.port}`);
  });
};

const shutdown = async (signal: string): Promise<void> => {
  ready = false;
  console.log(`Received ${signal}; shutting down GHM Core Engine`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
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
  await pool.end();
  process.exitCode = 1;
});
