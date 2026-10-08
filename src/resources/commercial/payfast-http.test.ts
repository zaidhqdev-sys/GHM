import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPayfastCheckout, validatePayfastItnWithProvider } from './payfast-http';

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

test('Payfast ITN provider validation accepts only an exact VALID response', async () => {
  const originalFetch = globalThis.fetch;
  let request: Request | undefined;
  globalThis.fetch = async (input, init) => {
    request = new Request(input, init);
    return new Response(' VALID\n', { status: 200 });
  };
  try {
    await validatePayfastItnWithProvider({
      merchant_id: '10000100',
      m_payment_id: '42',
      amount_gross: '199.00',
      payment_status: 'COMPLETE',
      signature: 'abc',
    }, 'sandbox');
    assert.equal(request?.url, 'https://sandbox.payfast.co.za/eng/query/validate');
    assert.equal(request?.method, 'POST');
    assert.equal(request?.headers.get('content-type'), 'application/x-www-form-urlencoded');
    assert.match(await request!.text(), /merchant_id=10000100/);
    assert.match(await request!.text(), /signature=abc/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Payfast ITN provider validation rejects non-VALID responses', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('INVALID', { status: 200 });
  try {
    await assert.rejects(
      validatePayfastItnWithProvider({ merchant_id: '10000100', m_payment_id: '42' }, 'sandbox'),
      /server confirmation invalid/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Payfast ITN provider validation rejects HTTP failures', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('ERROR', { status: 500 });
  try {
    await assert.rejects(
      validatePayfastItnWithProvider({ merchant_id: '10000100', m_payment_id: '42' }, 'sandbox'),
      /server confirmation HTTP 500/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Payfast ITN provider validation rejects network failures', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network unavailable'); };
  try {
    await assert.rejects(
      validatePayfastItnWithProvider({ merchant_id: '10000100', m_payment_id: '42' }, 'sandbox'),
      /network unavailable/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
