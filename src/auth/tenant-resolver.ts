import type { PoolClient } from 'pg';
import type { AuthContext } from './authorization';
import { requireAuthenticatedContext } from './authorization';
import type { TenantContext } from './tenant';

export const resolveTenantContext = async (client: PoolClient, context: AuthContext, businessId: number): Promise<TenantContext> => {
  requireAuthenticatedContext(context);
  if (!Number.isSafeInteger(businessId) || businessId <= 0) throw new Error('Invalid business tenant');
  const result = await client.query(
    "SELECT bm.id, bm.business_id, bm.account_id, bm.membership_role FROM ghm.business_membership bm JOIN ghm.business b ON b.id = bm.business_id WHERE bm.business_id = $1 AND bm.account_id = $2 AND bm.membership_status = 'active' AND b.is_active = true LIMIT 1",
    [businessId, context.userId],
  );
  if (result.rowCount !== 1) throw new Error('Business tenant access denied');
  const row = result.rows[0];
  return Object.freeze({ businessId: Number(row.business_id), accountId: Number(row.account_id), membershipId: Number(row.id), membershipRole: row.membership_role });
};
