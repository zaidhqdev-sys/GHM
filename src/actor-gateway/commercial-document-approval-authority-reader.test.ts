import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { PostgresCommercialDocumentApprovalAuthorityReader } from './commercial-document-approval-authority-reader';

const secret = Buffer.alloc(32, 7);
const encodedSecret = secret.toString('base64');

const createPool = (options: {
  result?: { authority_id: string; authority_event_id: number; event_type: 'granted' | 'revoked' };
  fail?: unknown;
} = {}) => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  let released = false;
  const client = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT * FROM ghm.gateway_manage_commercial_document_approval_authority')) {
        if (options.fail) throw options.fail;
        return { rowCount: 1, rows: [options.result ?? {
          authority_id: 'authority-123',
          authority_event_id: 55,
          event_type: 'granted',
        }] };
      }
      return { rowCount: null, rows: [] };
    },
    release() { released = true; },
  };
  return {
    pool: { async connect() { return client; } },
    calls,
    released: () => released,
  };
};

test('reader signs exact owner authority operation context and returns typed result', async () => {
  const fixture = createPool();
  const reader = new PostgresCommercialDocumentApprovalAuthorityReader(fixture.pool as never, encodedSecret);
  const result = await reader.manage(42, {
    action: 'grant',
    documentType: 'trial_terms',
    documentKey: 'zaid-business-pro-trial',
    jurisdictionCountryId: null,
    reason: 'Owner approved trial terms',
  });
  assert.deepEqual(result, {
    authorityId: 'authority-123',
    authorityEventId: 55,
    eventType: 'granted',
  });
  assert.equal(fixture.calls[0].sql, 'BEGIN');
  const call = fixture.calls.find((x) => x.sql.startsWith('SELECT * FROM ghm.gateway_manage_commercial_document_approval_authority'));
  assert.ok(call);
  const values = call.values!;
  assert.equal(values[0], 42);
  const context = JSON.parse(String(values[3]));
  assert.deepEqual(context, {
    action: 'grant',
    documentType: 'trial_terms',
    documentKey: 'zaid-business-pro-trial',
    jurisdictionCountryId: null,
    reason: 'Owner approved trial terms',
  });
  const payload = `ghm-actor-gateway:v2|42|commercial.document.authority.manage|${values[1]}|${values[2]}|${Buffer.from(String(values[3]), 'utf8').toString('hex')}`;
  const expected = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  assert.equal(values[4], expected);
  assert.equal(values[5], 'grant');
  assert.equal(values[6], 'trial_terms');
  assert.equal(values[7], 'zaid-business-pro-trial');
  assert.equal(values[8], null);
  assert.equal(values[9], 'Owner approved trial terms');
  assert.ok(fixture.calls.some((x) => x.sql === 'COMMIT'));
  assert.equal(fixture.calls.some((x) => x.sql === 'ROLLBACK'), false);
  assert.equal(fixture.released(), true);
});

test('reader rolls back and releases its connection when the database denies the owner', async () => {
  const fixture = createPool({ fail: Object.assign(new Error('private SQL detail'), { code: '42501' }) });
  const reader = new PostgresCommercialDocumentApprovalAuthorityReader(fixture.pool as never, encodedSecret);
  await assert.rejects(
    () => reader.manage(99, {
      action: 'grant',
      documentType: 'subscription_terms',
      documentKey: 'zaid-business-pro-subscription',
      jurisdictionCountryId: 710,
      reason: 'Owner authority check',
    }),
    (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === '42501'),
  );
  assert.ok(fixture.calls.some((x) => x.sql === 'ROLLBACK'));
  assert.equal(fixture.calls.some((x) => x.sql === 'COMMIT'), false);
  assert.equal(fixture.released(), true);
});

test('reader rejects noncanonical or incorrectly sized assertion secrets', () => {
  assert.throws(
    () => new PostgresCommercialDocumentApprovalAuthorityReader({ async connect() { throw new Error('unused'); } } as never, 'not-base64'),
    /canonical base64 for exactly 32 bytes/,
  );
});
