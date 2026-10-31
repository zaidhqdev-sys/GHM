import type { PoolConfig } from 'pg';

/**
 * PostgreSQL connections must validate the server certificate whenever TLS is enabled.
 * Render's managed PostgreSQL certificates are expected to chain to the host trust store.
 */
export const postgresSslConfig = (enabled: boolean): PoolConfig['ssl'] =>
  enabled ? { rejectUnauthorized: true } : false;
