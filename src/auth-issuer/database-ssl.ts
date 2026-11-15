import type { PoolConfig } from 'pg';

export type AuthIssuerDatabaseSslMode = 'internal' | 'external';

/**
 * Production issuer connections must explicitly select the Render network mode.
 * External mode encrypts traffic but does not authenticate the server certificate.
 */
export const authIssuerDatabaseSslConfig = (
  mode: string | undefined,
  isProduction: boolean,
): PoolConfig['ssl'] => {
  if (mode === 'internal') return false;
  if (mode === 'external') return { rejectUnauthorized: false };
  if (!isProduction && mode === undefined) return false;
  throw new Error('GHM_AUTH_ISSUER_DATABASE_SSL_MODE must be explicitly set to internal or external in production');
};
