import assert from 'node:assert/strict';
import test from 'node:test';
import { generatePayfastSignature } from './payfast';
import { classifyPayfastItnFailure, classifyPayfastVerificationError, payfastItnHttpStatus, encodePayfastValidationFields, parsePayfastItnFields, PayfastCallbackBoundary, PayfastItnPermanentError, resolvePayfastEnvironment } from './payfast-callback';

const unsigned = {
  merchant_id: '10000100',
  m_payment_id: '42',
  pf_payment_id: '1089250',
  amount_gross: '199.00',
  payment_status: 'COMPLETE',
  item_name: 'Test item',
  payment_date: '2026-11-04 00:00:00',
};
const fields = { ...unsigned, signature: generatePayfastSignature(unsigned, 'secret') };
const settings = { merchantId: '10000100', passphrase: 'secret', environment: 'sandbox' as const };


test('PayFast callback environment defaults to sandbox outside production only', () => {
  assert.equal(resolvePayfastEnvironment('test', undefined), 'sandbox');
  assert.equal(resolvePayfastEnvironment('development', ' live '), 'live');
  assert.throws(
    () => resolvePayfastEnvironment('production', undefined),
    /PAYFAST_ENVIRONMENT must be explicitly set/,
  );
  assert.throws(
    () => resolvePayfastEnvironment('production', ' '),
    /PAYFAST_ENVIRONMENT must be explicitly set/,
  );
  assert.equal(resolvePayfastEnvironment('production', 'live'), 'live');
  assert.equal(resolvePayfastEnvironment('production', 'sandbox'), 'sandbox');
  assert.throws(() => resolvePayfastEnvironment('production', 'staging'), /must be sandbox or live/);
});

test('PayFast callback rejects duplicate and non-string form fields', () => {
  assert.equal(parsePayfastItnFields({ ...fields, signature: ['a', 'b'] }), null);
  assert.equal(parsePayfastItnFields(null), null);
  const { item_name: _itemName, ...missingRequired } = fields;
  assert.equal(parsePayfastItnFields(missingRequired), null);
  assert.equal(parsePayfastItnFields({ 'bad key': 'x' }), null);
  assert.equal(parsePayfastItnFields({ ...fields, unexpected_admin_flag: '1' }), null);
  assert.equal(parsePayfastItnFields({ ...fields, custom_str1: 'supported custom field' })?.custom_str1, 'supported custom field');
  assert.equal(parsePayfastItnFields({ item_name: 'x'.repeat(2049) }), null);
  assert.deepEqual(parsePayfastItnFields({ ...fields, item_name: 'Example product' }), { ...fields, item_name: 'Example product' });
  assert.deepEqual(parsePayfastItnFields(fields), fields);
  assert.equal(encodePayfastValidationFields({ ...fields, item_name: 'Example product' }).includes('signature='), false);
  assert.match(encodePayfastValidationFields({ ...fields, item_name: 'Example product' }), /item_name=Example\+product/);
});

test('isolated PayFast callback confirms provider then calls only PayFast settlement function', async () => {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const db = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.includes('commercial_get_payfast_attempt')) {
        return { rowCount: 1, rows: [{ payment_attempt_id: 42, provider_code: 'payfast', amount_minor_units: 19900, attempt_status: 'succeeded', currency_code: 'ZAR' }] };
      }
      return { rowCount: 1, rows: [{ id: 1 }] };
    },
  };
  let confirmed = false;
  const boundary = new PayfastCallbackBoundary(db as never, settings, async () => { confirmed = true; });
  await boundary.handleItn(fields, '197.97.145.150');
  assert.equal(confirmed, true);
  assert.match(calls[0].sql, /commercial_get_payfast_attempt/);
  assert.match(calls[1].sql, /commercial_apply_payfast_payment_result/);
  assert.deepEqual(calls[1].values?.slice(0, 6), [42, '1089250', 'itn', calls[1].values?.[3], 'payment', 'succeeded']);
  assert.ok(calls[1].values?.[7] instanceof Date);
  assert.equal((calls[1].values?.[7] as Date).toISOString(), '2026-11-04T00:00:00.000Z');
});

test('isolated PayFast callback fails closed for mismatched provider before server confirmation', async () => {
  let confirmed = false;
  const db = { query: async () => ({ rowCount: 1, rows: [{ payment_attempt_id: 42, provider_code: null, amount_minor_units: 19900, attempt_status: 'pending_payment', currency_code: 'ZAR' }] }) };
  const boundary = new PayfastCallbackBoundary(db as never, settings, async () => { confirmed = true; });
  await assert.rejects(boundary.handleItn(fields, '197.97.145.150'), /provider mismatch/);
  assert.equal(confirmed, false);
});

test('isolated PayFast callback fails closed for invalid signature before server confirmation', async () => {
  let confirmed = false;
  const db = { query: async () => ({ rowCount: 1, rows: [{ payment_attempt_id: 42, provider_code: 'payfast', amount_minor_units: 19900, attempt_status: 'pending_payment', currency_code: 'ZAR' }] }) };
  const boundary = new PayfastCallbackBoundary(db as never, settings, async () => { confirmed = true; });
  await assert.rejects(boundary.handleItn({ ...fields, signature: 'bad' }, '197.97.145.150'), /signature invalid/);
  assert.equal(confirmed, false);
});


test('isolated PayFast callback rejects non-documented payment statuses before server confirmation', async () => {
  let confirmed = false;
  const unsupported = { ...unsigned, payment_status: 'FAILED' };
  const unsupportedFields = { ...unsupported, signature: generatePayfastSignature(unsupported, 'secret') };
  const db = {
    async query() {
      return { rowCount: 1, rows: [{ payment_attempt_id: 42, provider_code: 'payfast', amount_minor_units: 19900, attempt_status: 'pending_payment', currency_code: 'ZAR' }] };
    },
  };
  const boundary = new PayfastCallbackBoundary(db as never, settings, async () => { confirmed = true; });
  await assert.rejects(boundary.handleItn(unsupportedFields, '197.97.145.150'), /payment status invalid/);
  assert.equal(confirmed, false);
});

test('PayFast ITN acknowledgement policy stops retries for permanent rejects only', () => {
  assert.deepEqual(classifyPayfastItnFailure(new PayfastItnPermanentError('signature_invalid')), {
    retry: false,
    reason: 'signature_invalid',
  });
  assert.deepEqual(classifyPayfastItnFailure({ status: 413 }), {
    retry: false,
    reason: 'malformed_request',
  });
  assert.deepEqual(classifyPayfastItnFailure(new Error('PayFast validation endpoint timed out')), {
    retry: true,
    reason: 'transient_failure',
  });
  assert.deepEqual(classifyPayfastItnFailure({ code: 'ECONNRESET' }), {
    retry: true,
    reason: 'transient_failure',
  });
});

test('PayFast callback classifies a non-VALID confirmation as permanent', async () => {
  const db = {
    async query() {
      return { rowCount: 1, rows: [{ payment_attempt_id: 42, provider_code: 'payfast', amount_minor_units: 19900, attempt_status: 'pending_payment', currency_code: 'ZAR' }] };
    },
  };
  const boundary = new PayfastCallbackBoundary(db as never, settings, async () => {
    throw new PayfastItnPermanentError('server_confirmation_invalid');
  });
  await assert.rejects(boundary.handleItn(fields, '197.97.145.150'), /server confirmation invalid/);
  assert.equal(classifyPayfastItnFailure(new PayfastItnPermanentError('server_confirmation_invalid')).retry, false);
});

test('PayFast callback leaves confirmation network failures retryable', async () => {
  const db = {
    async query() {
      return { rowCount: 1, rows: [{ payment_attempt_id: 42, provider_code: 'payfast', amount_minor_units: 19900, attempt_status: 'pending_payment', currency_code: 'ZAR' }] };
    },
  };
  const boundary = new PayfastCallbackBoundary(db as never, settings, async () => {
    throw new Error('PayFast validation endpoint timed out');
  });
  let failure: unknown;
  try { await boundary.handleItn(fields, '197.97.145.150'); } catch (error) { failure = error; }
  assert.equal(classifyPayfastItnFailure(failure).retry, true);
});

test('PayFast callback leaves database failures retryable', async () => {
  let calls = 0;
  const db = {
    async query() {
      calls += 1;
      if (calls === 1) return { rowCount: 1, rows: [{ payment_attempt_id: 42, provider_code: 'payfast', amount_minor_units: 19900, attempt_status: 'pending_payment', currency_code: 'ZAR' }] };
      throw new Error('connection terminated');
    },
  };
  const boundary = new PayfastCallbackBoundary(db as never, settings, async () => undefined);
  let failure: unknown;
  try { await boundary.handleItn(fields, '197.97.145.150'); } catch (error) { failure = error; }
  assert.equal(classifyPayfastItnFailure(failure).retry, true);
});

test('PayFast callback classifies a permanent settlement rejection as non-retryable', async () => {
  let calls = 0;
  const db = {
    async query() {
      calls += 1;
      if (calls === 1) return { rowCount: 1, rows: [{ payment_attempt_id: 42, provider_code: 'payfast', amount_minor_units: 19900, attempt_status: 'failed', currency_code: 'ZAR' }] };
      throw new Error('commercial payment attempt is not payable');
    },
  };
  const boundary = new PayfastCallbackBoundary(db as never, settings, async () => undefined);
  let failure: unknown;
  try { await boundary.handleItn(fields, '197.97.145.150'); } catch (error) { failure = error; }
  assert.equal(classifyPayfastItnFailure(failure).retry, false);
});


test('PayFast ITN HTTP acknowledgement maps only permanent rejects to 200', () => {
  const invalidSignature = classifyPayfastVerificationError(new Error('Payfast ITN signature invalid'));
  assert.ok(invalidSignature instanceof PayfastItnPermanentError);
  assert.equal(invalidSignature.reason, 'signature_invalid');
  assert.equal(payfastItnHttpStatus(invalidSignature), 200);
  assert.equal(payfastItnHttpStatus({ status: 413 }), 200);
  assert.equal(payfastItnHttpStatus(new Error('PayFast validation endpoint timed out')), 500);
  assert.equal(payfastItnHttpStatus(new Error('unexpected verification implementation error')), 500);
  assert.equal(classifyPayfastVerificationError(new Error('unexpected verification implementation error')), null);
});
