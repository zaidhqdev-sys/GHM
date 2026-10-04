import { PoolClient } from 'pg';
import { AuthContext, requireAuthenticatedContext } from '../auth/authorization';
import { withTransaction, TransactionPool } from './transaction';
import { resolveTenantContext } from '../auth/tenant-resolver';
import type { TenantContext } from '../auth/tenant';

export type AuthorizedTransactionWork<T> = (client: PoolClient, context: AuthContext) => Promise<T>;
export type TenantTransactionWork<T> = (client: PoolClient, context: AuthContext, tenant: TenantContext) => Promise<T>;

export const withAuthorizedTransaction = async <T>(context: AuthContext, work: AuthorizedTransactionWork<T>, transactionPool?: TransactionPool): Promise<T> => {
  requireAuthenticatedContext(context);
  return withTransaction((client) => work(client, context), transactionPool);
};

export const withTenantTransaction = async <T>(context: AuthContext, businessId: number, work: TenantTransactionWork<T>, transactionPool?: TransactionPool): Promise<T> => {
  requireAuthenticatedContext(context);
  return withTransaction(async client => {
    const tenant = await resolveTenantContext(client, context, businessId);
    return work(client, context, tenant);
  }, transactionPool);
};
