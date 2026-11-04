import assert from 'node:assert/strict';
import test from 'node:test';
import { generatePayfastSignature } from './payfast';
import { encodePayfastValidationFields, parsePayfastItnFields, PayfastCallbackBoundary } from './payfast-callback';

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
