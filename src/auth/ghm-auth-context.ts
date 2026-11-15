/**
 * Identity-centric GHM Auth context (new path).
 * Canonical identity = ghm.account_identity.id.
 * JWT role/membership claims are NOT authorization authority.
 *
 * Uses number (safe integer) at the HTTP boundary — equivalent to bigint ids
 * that fit JavaScript safe integers (GHM identity convention).
 */

import type { AuthContext, GhmRole } from './authorization';

export interface GhmAuthContext {
  readonly accountId: number;
}

export const isGhmAuthContext = (value: unknown): value is GhmAuthContext =>
  typeof value === 'object'
  && value !== null
  && Number.isSafeInteger((value as GhmAuthContext).accountId)
  && (value as GhmAuthContext).accountId > 0;

/**
 * Smallest compatibility adapter for existing AuthContext consumers.
 * Loads coarse `role` from GHM state — never from JWT claims.
 */
export const toLegacyAuthContext = (
  ghm: GhmAuthContext,
  role: GhmRole,
  actorGatewayBearerToken?: string,
): AuthContext => {
  if (!isGhmAuthContext(ghm)) {
    throw new Error('Authentication required');
  }
  if (role !== 'admin' && role !== 'customer' && role !== 'business') {
    throw new Error('Authentication required');
  }
  const context: AuthContext = { userId: ghm.accountId, role };
  if (actorGatewayBearerToken) {
    Object.defineProperty(context, 'actorGatewayBearerToken', {
      value: actorGatewayBearerToken,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(context);
};
