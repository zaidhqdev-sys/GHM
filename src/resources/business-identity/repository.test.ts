import assert from 'node:assert/strict';
import test from 'node:test';
import { PostgresBusinessIdentityRepository } from './repository';
import type { AuthContext } from '../../auth/authorization';
import type { TransactionPool } from '../../db/transaction';

const context: AuthContext = { userId: 7, role: 'business' };

test('business profile rejects malformed and whitespace-containing website URLs before database access', async () => {
  let connections = 0;
  const pool = {
    connect: async () => {
      connections += 1;
      throw new Error('database should not be reached for invalid input');
    },
  } as unknown as TransactionPool;
  const repository = new PostgresBusinessIdentityRepository(pool);

  await assert.rejects(
    () => repository.updateBusiness(context, 42, { website: 'https://example.com/path with spaces' }),
    /whitespace/,
  );
  await assert.rejects(
    () => repository.updateBusiness(context, 42, { website: 'ftp://example.com' }),
    /whitespace/,
  );
  assert.equal(connections, 0);
});
