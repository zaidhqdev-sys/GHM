import assert from 'node:assert/strict';
import test from 'node:test';
import { generatePayfastSignature, verifyPayfastItn } from './payfast';

test('generates a deterministic PayFast signature', () => {
  const signature = generatePayfastSignature({
    merchant_id: '10000100',
    merchant_key: 'abc',
    amount: '199.00',
    item_name: 'Business Pro',
  }, 'secret');
  assert.equal(signature, '3bea28e8f873c40be0186d662433bb8c');
});

test('verifies a valid PayFast ITN', () => {
  const fields = {
    merchant_id: '10000100',
    m_payment_id: 'attempt-1',
    pf_payment_id: '12345',
    amount_gross: '199.00',
    payment_status: 'COMPLETE',
    payment_date: '2026-10-07 20:00:00',
  };
  const signature = generatePayfastSignature(fields, 'secret');
  const result = verifyPayfastItn({
    fields: { ...fields, signature },
    sourceIp: '197.97.145.150',
    expectedMerchantId: '10000100',
    expectedAmountMinorUnits: 19900,
    passphrase: 'secret',
  });
  assert.equal(result.merchantPaymentId, 'attempt-1');
  assert.equal(result.providerPaymentId, '12345');
  assert.equal(result.transactionStatus, 'COMPLETE');
  assert.equal(result.amountMinorUnits, 19900);
});

test('rejects invalid source IP before accepting an ITN', () => {
  const fields = {
    merchant_id: '10000100',
    m_payment_id: 'attempt-1',
    amount_gross: '199.00',
    payment_status: 'COMPLETE',
  };
  const signature = generatePayfastSignature(fields, 'secret');
  assert.throws(() => verifyPayfastItn({
    fields: { ...fields, signature },
    sourceIp: '203.0.113.10',
    expectedMerchantId: '10000100',
    expectedAmountMinorUnits: 19900,
    passphrase: 'secret',
  }), /source IP invalid/);
});

test('rejects merchant and amount mismatches', () => {
  const fields = {
    merchant_id: '10000100',
    m_payment_id: 'attempt-1',
    amount_gross: '199.00',
    payment_status: 'COMPLETE',
  };
  const signature = generatePayfastSignature(fields, 'secret');
  assert.throws(() => verifyPayfastItn({
    fields: { ...fields, signature },
    sourceIp: '197.97.145.150',
    expectedMerchantId: 'wrong',
    expectedAmountMinorUnits: 19900,
    passphrase: 'secret',
  }), /merchant mismatch/);

  assert.throws(() => verifyPayfastItn({
    fields: { ...fields, signature },
    sourceIp: '197.97.145.150',
    expectedMerchantId: '10000100',
    expectedAmountMinorUnits: 20000,
    passphrase: 'secret',
  }), /amount mismatch/);
});

test('rejects a tampered signature', () => {
  const fields = {
    merchant_id: '10000100',
    m_payment_id: 'attempt-1',
    amount_gross: '199.00',
    payment_status: 'COMPLETE',
  };
  assert.throws(() => verifyPayfastItn({
    fields: { ...fields, signature: '00000000000000000000000000000000' },
    sourceIp: '197.97.145.150',
    expectedMerchantId: '10000100',
    expectedAmountMinorUnits: 19900,
    passphrase: 'secret',
  }), /signature invalid/);
});
