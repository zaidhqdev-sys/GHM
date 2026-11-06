import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { TransactionPool } from '../../db/transaction';
import { PostgresBusinessRegistrationIdentityRepository } from './repository';

class FakeClient {
  queries: Array<{ text: string; values?: unknown[] }> = [];
  released = false;
  membershipRole = 'owner';
  resultRow = {
    business_id: 55,
    registration_status: 'registered',
    registration_number: '2020/123456/07',
    legal_name: 'Example (Pty) Ltd',
    updated_at: new Date('2026-10-19T12:00:00.000Z'),
  };
  async query(text: string, values?: unknown[]) {
    this.queries.push({ text, values });
    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rowCount: 0, rows: [] };
    if (text.includes('FROM ghm.business_membership bm JOIN ghm.business b')) {
      return { rowCount: 1, rows: [{ id: 9, business_id: 55, account_id: 42, membership_role: this.membershipRole }] };
    }
    if (text.includes('ghm.read_business_registration_identity')) return { rowCount: 1, rows: [this.resultRow] };
    if (text.includes('ghm.update_business_registration_identity')) return { rowCount: 1, rows: [this.resultRow] };
    throw new Error(`Unexpected SQL: ${text}`);
  }
  release() { this.released = true; }
}
class FakePool {
  constructor(readonly client: FakeClient) {}
  async connect() { return this.client; }
}

const context: AuthContext = { userId: 42, role: 'business' };

test('repository binds authenticated account and canonical Business ID for private read', async () => {
  const client = new FakeClient();
  const repository = new PostgresBusinessRegistrationIdentityRepository(new FakePool(client) as unknown as TransactionPool);
  const result = await repository.getRegistrationIdentity(context, 55);
  assert.equal(result.businessId, 55);
  assert.equal(result.registrationNumber, '2020/123456/07');
  assert.deepEqual(client.queries.find(q => q.text.includes('ghm.read_business_registration_identity'))?.values, [42, 55]);
  assert.equal(client.released, true);
});

test('repository binds full registration declaration and requires manager membership', async () => {
  const client = new FakeClient();
  const repository = new PostgresBusinessRegistrationIdentityRepository(new FakePool(client) as unknown as TransactionPool);
  await repository.updateRegistrationIdentity(context, {
    businessId: 55, registrationStatus: 'registered', registrationNumber: '2020/123456/07', legalName: 'Example (Pty) Ltd',
  });
  assert.deepEqual(client.queries.find(q => q.text.includes('ghm.update_business_registration_identity'))?.values,
    [42, 55, 'registered', '2020/123456/07', 'Example (Pty) Ltd']);

  const memberClient = new FakeClient();
  memberClient.membershipRole = 'member';
  const memberRepository = new PostgresBusinessRegistrationIdentityRepository(new FakePool(memberClient) as unknown as TransactionPool);
  await assert.rejects(() => memberRepository.getRegistrationIdentity(context, 55), /Business management permission required/);
  assert.equal(memberClient.queries.some(q => q.text.includes('ghm.read_business_registration_identity')), false);
  assert.equal(memberClient.queries.some(q => q.text === 'ROLLBACK'), true);
});
