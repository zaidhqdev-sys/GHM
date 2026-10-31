import { PoolClient } from 'pg';

export interface TransactionPool {
  connect(): Promise<PoolClient>;
}

export type TransactionWork<T> = (client: PoolClient) => Promise<T>;

export const withTransaction = async <T>(
  work: TransactionWork<T>,
  transactionPool?: TransactionPool,
): Promise<T> => {
  const activePool = transactionPool ?? (await import('./pool')).pool;
  const client = await activePool.connect();

  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
