import { PoolClient } from 'pg';
import { AuthContext, requireAuthenticatedContext } from '../auth/authorization';
import { withTransaction, TransactionPool } from './transaction';

export type AuthorizedTransactionWork<T> = (
  client: PoolClient,
  context: AuthContext,
) => Promise<T>;

export const withAuthorizedTransaction = async <T>(
  context: AuthContext,
  work: AuthorizedTransactionWork<T>,
  transactionPool?: TransactionPool,
): Promise<T> => {
  requireAuthenticatedContext(context);
  return withTransaction((client) => work(client, context), transactionPool);
};
