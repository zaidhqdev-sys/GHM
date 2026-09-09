import assert from 'node:assert/strict';
import test from 'node:test';
import { PoolClient } from 'pg';
import { AuthContext } from '../auth/authorization';
import { withAuthorizedTransaction } from './authorized-transaction';
import { TransactionPool, withTransaction } from './transaction';

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

test('transaction uses one checked-out client and commits successful work', async () => {
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
