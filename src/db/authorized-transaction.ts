import { PoolClient } from 'pg';
import { AuthContext } from '../auth/authorization';
import { withTransaction } from './transaction';

export type AuthorizedTransactionWork<T> = (
  client: PoolClient,
  context: AuthContext,
) => Promise<T>;

export const withAuthorizedTransaction = async <T>(
  context: AuthContext,
  work: AuthorizedTransactionWork<T>,
): Promise<T> => withTransaction((client) => work(client, context));
