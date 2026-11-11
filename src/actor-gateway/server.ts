import http from 'http';
import { Pool } from 'pg';
import { actorGatewayDatabaseSslConfig } from './database-ssl';
import { createAccessJwtVerifier } from '../auth/foundation/access-jwt-verifier';
import {
  loadEs256VerificationKeys,
  verificationKeyMapFromPublicKeys,
} from '../auth/foundation/es256-keys';
import { createActorGatewayApp } from './app';
import { PostgresActorIdentityReader } from './actor-identity-reader';
import { PostgresBusinessRegistrationIdentityReader } from './business-registration-identity-reader';
import { PostgresCapabilityGovernanceReader } from './capability-governance-reader';
import { PostgresSupplierClassificationReader } from './supplier-classification-reader';
import { PostgresBusinessProfileReader } from './business-profile-reader';
import { PostgresGatewayCapabilityMutationReader } from './business-capability-mutation-reader';
import { assertActorGatewayDatabaseIdentity } from './database-principal';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const isProduction = process.env.NODE_ENV === 'production';
const databaseSsl = actorGatewayDatabaseSslConfig(process.env.DATABASE_SSL_MODE, isProduction);

const databaseUrl = required('GHM_ACTOR_GATEWAY_DATABASE_URL');
const port = Number.parseInt(process.env.PORT ?? '10000', 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port');
}

const keys = loadEs256VerificationKeys();
const verifier = createAccessJwtVerifier(verificationKeyMapFromPublicKeys(keys));
const capabilityAssertionSecret = required('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET');
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: databaseSsl,
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});
const app = createActorGatewayApp({
  verifier,
  actorIdentityReader: new PostgresActorIdentityReader(pool, capabilityAssertionSecret),
  businessRegistrationIdentityReader: new PostgresBusinessRegistrationIdentityReader(pool, capabilityAssertionSecret),
  capabilityGovernanceReader: new PostgresCapabilityGovernanceReader(pool, capabilityAssertionSecret),
  supplierClassificationReader: new PostgresSupplierClassificationReader(pool, capabilityAssertionSecret),
  businessProfileReader: new PostgresBusinessProfileReader(pool, capabilityAssertionSecret),
  businessCapabilityMutationReader: new PostgresGatewayCapabilityMutationReader(pool, capabilityAssertionSecret),
});
const server = http.createServer(app);
server.requestTimeout = 10_000;
server.headersTimeout = 5_000;
server.keepAliveTimeout = 5_000;

const safeErrorDetails = (error: unknown): { name: string } => ({
  name: error instanceof Error ? error.name : 'UnknownError',
});

const shutdown = async (signal: string): Promise<void> => {
  console.log(`Received ${signal}; shutting down GHM Actor Gateway`);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
};

process.once('SIGTERM', () => void shutdown('SIGTERM').finally(() => process.exit(0)));
process.once('SIGINT', () => void shutdown('SIGINT').finally(() => process.exit(0)));
process.on('uncaughtException', (error: Error) => {
  console.error(JSON.stringify({ event: 'actor_gateway_uncaught_exception', error: safeErrorDetails(error) }));
  process.exit(1);
});
process.on('unhandledRejection', (reason: unknown) => {
  console.error(JSON.stringify({ event: 'actor_gateway_unhandled_rejection', error: safeErrorDetails(reason) }));
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
  assertActorGatewayDatabaseIdentity(identity.rows[0]);
  server.listen(port, () => {
    console.log(`GHM Actor Gateway listening on port ${port}`);
  });
};

void start().catch(async (error: unknown) => {
  console.error(JSON.stringify({ event: 'actor_gateway_startup_failed', error: safeErrorDetails(error) }));
  await pool.end();
  process.exitCode = 1;
});
