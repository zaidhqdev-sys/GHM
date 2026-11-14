import type { PoolConfig } from 'pg';

export type ActorGatewayDatabaseSslMode = 'internal' | 'external';

/**
 * Render same-region private-network connections use the internal URL and do
 * not require TLS. External Render Postgres connections require TLS. This
 * external mode encrypts traffic but does not authenticate the server certificate.
 */
export const actorGatewayDatabaseSslConfig = (
  mode: string | undefined,
  isProduction: boolean,
): PoolConfig['ssl'] => {
  if (mode === 'internal') return false;
  if (mode === 'external') return { rejectUnauthorized: false };
  if (!isProduction && mode === undefined) return false;
  throw new Error('DATABASE_SSL_MODE must be explicitly set to internal or external in production');
};
