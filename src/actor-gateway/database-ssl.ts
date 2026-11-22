import type { PoolConfig } from 'pg';

export type ActorGatewayDatabaseSslMode = 'internal' | 'external';

/**
 * Render Postgres internal URLs use same-region private networking. Internal
 * TLS is optional and uses a self-signed certificate, so require encryption
 * without attempting CA/hostname authentication.
 *
 * External URLs use Render-managed certificates trusted by the Node.js system
 * CA store. Require TLS and certificate verification for external connections.
 */
export const actorGatewayDatabaseSslConfig = (
  mode: string | undefined,
  isProduction: boolean,
): PoolConfig['ssl'] => {
  if (mode === 'internal') return { rejectUnauthorized: false };
  if (mode === 'external') return { rejectUnauthorized: true };
  if (!isProduction && mode === undefined) return false;
  throw new Error('DATABASE_SSL_MODE must be explicitly set to internal or external in production');
};
