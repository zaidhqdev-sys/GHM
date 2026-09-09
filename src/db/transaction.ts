import { PoolClient } from 'pg';
import { pool } from './pool';

export type TransactionWork<T> = (client: PoolClient) => Promise<T>;

export const withTransaction = async <T>(work: TransactionWork<T>): Promise<T> => {
  const client = await pool.connect();

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
