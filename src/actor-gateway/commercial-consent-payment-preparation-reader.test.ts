import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { PostgresCommercialConsentPaymentPreparationReader } from './commercial-consent-payment-preparation-reader';

const secret = Buffer.alloc(32, 11);
const encodedSecret = secret.toString('base64');
const input = {
  businessId: 91,
  documentVersionId: 77,
  countryId: 4,
  idempotencyKey: 'consent-payment-12345',
  accepted: true as const,
  requestId: 'req-abc-123',
};

const createPool = (options: { fail?: unknown } = {}) => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  let released = false;
  const client = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT * FROM ghm.gateway_prepare_commercial_payment_with_consent')) {
        if (options.fail) throw options.fail;
        return {
          rowCount: 1,
          rows: [{
            payment_attempt_id: 601,
            consent_event_id: 701,
            business_id: 91,
            subscription_id: 301,
            price_id: 401,
            provider_code: 'payfast',
            amount_minor_units: 19900,
            currency_id: 4,
            billing_interval: 'month' as const,
            attempt_status: 'pending_checkout',
            idempotency_key: input.idempotencyKey,
            expires_at: new Date('2026-11-16T18:00:00.000Z'),
          }],
        };
      }
      return { rowCount: null, rows: [] };
    },
    release() { released = true; },
  };
  return { pool: { async connect() { return client; } }, calls, released: () => released };
};

test('payment preparation reader signs exact consent, Business, document and provider context', async () => {
  const fixture = createPool();
  const reader = new PostgresCommercialConsentPaymentPreparationReader(fixture.pool as never, encodedSecret, 'payfast');
  const result = await reader.prepare(42, input);
  assert.deepEqual(result, {
    paymentAttemptId: 601,
    consentEventId: 701,
    businessId: 91,
    subscriptionId: 301,
    priceId: 401,
    providerCode: 'payfast',
    amountMinorUnits: 19900,
    currencyId: 4,
    billingInterval: 'month',
    attemptStatus: 'pending_checkout',
    idempotencyKey: input.idempotencyKey,
    expiresAt: new Date('2026-11-16T18:00:00.000Z'),
  });
  assert.equal(fixture.calls[0].sql, 'BEGIN');
  const call = fixture.calls.find((entry) => entry.sql.startsWith('SELECT * FROM ghm.gateway_prepare_commercial_payment_with_consent'));
  assert.ok(call);
  const values = call.values!;
  assert.equal(values[0], 42);
  assert.equal(values[5], 91);
  assert.equal(values[6], 77);
  assert.equal(values[7], 4);
  assert.equal(values[8], input.idempotencyKey);
  assert.equal(values[9], 'payfast');
  assert.equal(values[10], true);
  assert.equal(values[11], null);
  assert.equal(values[12], 'req-abc-123');
  const context = JSON.parse(String(values[3]));
  assert.deepEqual(context, {
    businessId: 91,
    documentVersionId: 77,
    countryId: 4,
    idempotencyKey: input.idempotencyKey,
    providerCode: 'payfast',
    accepted: true,
    expiresAt: null,
    requestId: 'req-abc-123',
  });
  const payload = `ghm-actor-gateway:v2|42|commercial.payment.prepare_with_consent|${values[1]}|${values[2]}|${Buffer.from(String(values[3]), 'utf8').toString('hex')}`;
  assert.equal(values[4], createHmac('sha256', secret).update(payload, 'utf8').digest('hex'));
  assert.ok(fixture.calls.some((entry) => entry.sql === 'COMMIT'));
  assert.equal(fixture.calls.some((entry) => entry.sql === 'ROLLBACK'), false);
  assert.equal(fixture.released(), true);
});

test('payment preparation reader rolls back on database denial and releases connection', async () => {
  const fixture = createPool({ fail: Object.assign(new Error('private SQL detail'), { code: '42501' }) });
  const reader = new PostgresCommercialConsentPaymentPreparationReader(fixture.pool as never, encodedSecret, 'payfast');
  await assert.rejects(
    () => reader.prepare(42, input),
    (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === '42501'),
  );
  assert.ok(fixture.calls.some((entry) => entry.sql === 'ROLLBACK'));
  assert.equal(fixture.calls.some((entry) => entry.sql === 'COMMIT'), false);
  assert.equal(fixture.released(), true);
});

test('payment preparation reader rejects missing or unsupported provider adapters at startup', () => {
  assert.throws(
    () => new PostgresCommercialConsentPaymentPreparationReader({ async connect() { throw new Error('unused'); } } as never, encodedSecret, 'stripe'),
    /does not identify an installed payment adapter/,
  );
  assert.throws(
    () => new PostgresCommercialConsentPaymentPreparationReader({ async connect() { throw new Error('unused'); } } as never, 'bad-secret', 'payfast'),
    /canonical base64 for exactly 32 bytes/,
  );
});
