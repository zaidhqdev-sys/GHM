import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPayfastCheckout } from './payfast-http';

const base = {
  merchantId: '10000100',
  merchantKey: 'sandbox-key',
  passphrase: 'secret',
  environment: 'sandbox' as const,
  paymentAttemptId: 42,
  itemName: 'ZAID Connect - Demo',
  returnUrl: 'https://example.test/payments/success',
  cancelUrl: 'https://example.test/payments/cancel',
  notifyUrl: 'https://example.test/api/v1/commercial/payfast/itn',
};

test('Payfast checkout is signed from the governed payment attempt values', () => {
  const checkout = buildPayfastCheckout({ ...base, amountMinorUnits: 19900 });
  assert.equal(checkout.actionUrl, 'https://sandbox.payfast.co.za/eng/process');
  assert.equal(checkout.fields.amount, '199.00');
  assert.equal(checkout.fields.m_payment_id, '42');
  assert.match(checkout.fields.signature, /^[0-9a-f]{32}$/);
});

test('Payfast checkout signature changes with governed amount', () => {
  const a = buildPayfastCheckout({ ...base, amountMinorUnits: 19900 });
  const b = buildPayfastCheckout({ ...base, amountMinorUnits: 29900 });
  assert.notEqual(a.fields.signature, b.fields.signature);
});

test('Payfast checkout does not record a payment result by construction', () => {
  const checkout = buildPayfastCheckout({ ...base, amountMinorUnits: 19900 });
  assert.equal(Object.hasOwn(checkout.fields, 'payment_status'), false);
  assert.equal(Object.hasOwn(checkout.fields, 'pf_payment_id'), false);
});
