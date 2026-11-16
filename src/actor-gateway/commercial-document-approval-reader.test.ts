import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { PostgresCommercialDocumentApprovalReader } from './commercial-document-approval-reader';

const secret = Buffer.alloc(32, 9);
const encodedSecret = secret.toString('base64');

const createPool = (options: { fail?: unknown } = {}) => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  let released = false;
  const client = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT * FROM ghm.gateway_approve_commercial_document_version')) {
        if (options.fail) throw options.fail;
        return { rowCount: 1, rows: [{
          status_event_id: 501,
          document_version_id: 77,
          authority_event_id: 301,
          status: 'approved' as const,
        }] };
      }
      return { rowCount: null, rows: [] };
    },
    release() { released = true; },
  };
  return { pool: { async connect() { return client; } }, calls, released: () => released };
};

test('approval reader binds actor, exact version and reason in a one-use assertion', async () => {
  const fixture = createPool();
  const reader = new PostgresCommercialDocumentApprovalReader(fixture.pool as never, encodedSecret);
  const result = await reader.approve(42, { documentVersionId: 77, reason: 'Owner approved exact version' });
  assert.deepEqual(result, {
    statusEventId: 501,
    documentVersionId: 77,
    authorityEventId: 301,
    status: 'approved',
  });
  assert.equal(fixture.calls[0].sql, 'BEGIN');
  const call = fixture.calls.find((entry) => entry.sql.startsWith('SELECT * FROM ghm.gateway_approve_commercial_document_version'));
  assert.ok(call);
  const values = call.values!;
  assert.equal(values[0], 42);
  assert.equal(values[5], 77);
  assert.equal(values[6], 'Owner approved exact version');
  const context = JSON.parse(String(values[3]));
  assert.deepEqual(context, { documentVersionId: 77, reason: 'Owner approved exact version' });
  const payload = `ghm-actor-gateway:v2|42|commercial.document.status.approve|${values[1]}|${values[2]}|${Buffer.from(String(values[3]), 'utf8').toString('hex')}`;
  assert.equal(values[4], createHmac('sha256', secret).update(payload, 'utf8').digest('hex'));
  assert.ok(fixture.calls.some((entry) => entry.sql === 'COMMIT'));
  assert.equal(fixture.calls.some((entry) => entry.sql === 'ROLLBACK'), false);
  assert.equal(fixture.released(), true);
});

test('approval reader rolls back on database denial and releases connection', async () => {
  const fixture = createPool({ fail: Object.assign(new Error('private SQL detail'), { code: '42501' }) });
  const reader = new PostgresCommercialDocumentApprovalReader(fixture.pool as never, encodedSecret);
  await assert.rejects(
    () => reader.approve(99, { documentVersionId: 77, reason: 'Attempted approval' }),
    (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === '42501'),
  );
  assert.ok(fixture.calls.some((entry) => entry.sql === 'ROLLBACK'));
  assert.equal(fixture.calls.some((entry) => entry.sql === 'COMMIT'), false);
  assert.equal(fixture.released(), true);
});

test('approval reader rejects a noncanonical or incorrectly sized assertion secret', () => {
  assert.throws(
    () => new PostgresCommercialDocumentApprovalReader({ async connect() { throw new Error('unused'); } } as never, 'bad-secret'),
    /canonical base64 for exactly 32 bytes/,
  );
});
