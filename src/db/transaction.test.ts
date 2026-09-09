import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoolClient } from 'pg';
import type { AuthContext } from '../auth/authorization';
import type { TransactionPool, withTransaction as WithTransaction } from './transaction';
import type { withAuthorizedTransaction as WithAuthorizedTransaction } from './authorized-transaction';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-qualification';
process.env.DATABASE_URL = 'postgres://qualification:test@localhost:5432/ghm';
process.env.INVITE_CODE = 'test-invite-code';
process.env.CORS_ORIGINS = 'http://localhost:3000';

type FakeClient = {
  calls: string[];
  released: boolean;
  query: (sql: string) => Promise<unknown>;
  release: () => void;
};

const createFakeClient = (): FakeClient => ({
  calls: [],
  released: false,
  async query(sql: string): Promise<void> {
    this.calls.push(sql);
  },
  release(): void {
    this.released = true;
  },
});

const asPoolClient = (client: FakeClient): PoolClient => client as unknown as PoolClient;

const createFakePool = (client: FakeClient): TransactionPool => ({
  async connect(): Promise<PoolClient> {
    return asPoolClient(client);
  },
});

const loadTransactions = async (): Promise<{
  withTransaction: typeof WithTransaction;
  withAuthorizedTransaction: typeof WithAuthorizedTransaction;
}> => {
  const [{ withTransaction }, { withAuthorizedTransaction }] = await Promise.all([
    import('./transaction'),
    import('./authorized-transaction'),
  ]);
  return { withTransaction, withAuthorizedTransaction };
};

test('transaction uses one checked-out client and commits successful work', async () => {
  const { withTransaction } = await loadTransactions();
  const client = createFakeClient();
  let workClient: PoolClient | undefined;

  const result = await withTransaction(
    async (checkedOutClient) => {
      workClient = checkedOutClient;
      return 'committed';
    },
    createFakePool(client),
  );

  assert.equal(result, 'committed');
  assert.equal(workClient, asPoolClient(client));
  assert.deepEqual(client.calls, ['BEGIN', 'COMMIT']);
  assert.equal(client.released, true);
});

test('transaction rolls back failed work and releases the client', async () => {
  const { withTransaction } = await loadTransactions();
  const client = createFakeClient();
  const failure = new Error('work failed');

  await assert.rejects(
    () => withTransaction(async () => { throw failure; }, createFakePool(client)),
    failure,
  );

  assert.deepEqual(client.calls, ['BEGIN', 'ROLLBACK']);
  assert.equal(client.released, true);
});

test('authorized transaction passes the same AuthContext into transaction work', async () => {
  const { withAuthorizedTransaction } = await loadTransactions();
  const client = createFakeClient();
  const context: AuthContext = { userId: 7, role: 'customer' };
  let receivedContext: AuthContext | undefined;
  let receivedClient: PoolClient | undefined;

  const result = await withAuthorizedTransaction(
    context,
    async (checkedOutClient, authContext) => {
      receivedClient = checkedOutClient;
      receivedContext = authContext;
      return authContext.userId;
    },
    createFakePool(client),
  );

  assert.equal(result, 7);
  assert.equal(receivedClient, asPoolClient(client));
  assert.equal(receivedContext, context);
  assert.deepEqual(client.calls, ['BEGIN', 'COMMIT']);
  assert.equal(client.released, true);
});
