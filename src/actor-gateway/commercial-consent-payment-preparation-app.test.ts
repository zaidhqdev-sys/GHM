import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createAccessJwtVerifier, ACCESS_JWT_AUD, ACCESS_JWT_ISS } from '../auth/foundation/access-jwt-verifier';
import { createActorGatewayApp } from './app';
import type { ActorIdentityReader } from './actor-identity-reader';
import type { CommercialConsentPaymentPreparationReader } from './commercial-consent-payment-preparation-reader';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const kid = 'ghm-commercial-consent-payment-test-1';
const verifier = createAccessJwtVerifier(new Map([[kid, publicKeyPem]]));
const sign = (accountId: number): string => {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { sub: String(accountId), iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD, iat: now, exp: now + 900 },
    privateKeyPem,
    { algorithm: 'ES256', keyid: kid },
  );
};

const withServer = async (
  options: {
    reader?: CommercialConsentPaymentPreparationReader;
    enabled?: boolean;
    launchAuthorized?: boolean;
  },
  work: (baseUrl: string) => Promise<void>,
): Promise<void> => {
  const actorIdentityReader: ActorIdentityReader = {
    async readOwnIdentity(accountId) { return { accountId, role: 'business', fullName: null }; },
  };
  const server = http.createServer(createActorGatewayApp({
    verifier,
    actorIdentityReader,
    commercialConsentPaymentPreparationReader: options.reader,
    commercialPaymentPreparationEnabled: options.enabled,
    commercialLaunchAuthorized: options.launchAuthorized,
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not start');
  try { await work(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
};

const validBody = {
  businessId: 91,
  documentVersionId: 77,
  countryId: 4,
  idempotencyKey: 'consent-payment-12345',
  accepted: true,
};

test('payment preparation route fails closed unless both independent server gates are enabled', async () => {
  const reader: CommercialConsentPaymentPreparationReader = {
    async prepare() { throw new Error('must not be called while disabled'); },
  };
  for (const options of [
    { reader, enabled: false, launchAuthorized: true },
    { reader, enabled: true, launchAuthorized: false },
    { reader, enabled: false, launchAuthorized: false },
    { reader: undefined, enabled: true, launchAuthorized: true },
  ]) {
    await withServer(options, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/commercial/payment-prepare`, {
        method: 'POST',
        headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: 'service_unavailable' });
    });
  }
});

test('payment preparation route derives actor from verified bearer and never accepts a provider from the browser', async () => {
  const calls: Array<{ actor: number; input: unknown }> = [];
  const reader: CommercialConsentPaymentPreparationReader = {
    async prepare(actor, input) {
      calls.push({ actor, input });
      return {
        paymentAttemptId: 601,
        consentEventId: 701,
        businessId: input.businessId,
        subscriptionId: 301,
        priceId: 401,
        providerCode: 'payfast',
        amountMinorUnits: 19900,
        currencyId: 4,
        billingInterval: 'month',
        attemptStatus: 'pending_checkout',
        idempotencyKey: input.idempotencyKey,
        expiresAt: new Date('2026-11-16T18:00:00.000Z'),
      };
    },
  };
  await withServer({ reader, enabled: true, launchAuthorized: true }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/commercial/payment-prepare`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${sign(42)}`,
        'content-type': 'application/json',
        'x-request-id': 'req-abc-123',
      },
      body: JSON.stringify(validBody),
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as { paymentPreparation: { paymentAttemptId: number; consentEventId: number; providerCode: string } };
    assert.deepEqual(payload.paymentPreparation, {
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
      idempotencyKey: validBody.idempotencyKey,
      expiresAt: '2026-11-16T18:00:00.000Z',
    });
  });
  assert.deepEqual(calls, [{
    actor: 42,
    input: {
      businessId: 91,
      documentVersionId: 77,
      countryId: 4,
      idempotencyKey: validBody.idempotencyKey,
      accepted: true,
      requestId: 'req-abc-123',
    },
  }]);
});

test('payment preparation route rejects provider, actor and other extra browser fields', async () => {
  let calls = 0;
  const reader: CommercialConsentPaymentPreparationReader = {
    async prepare() {
      calls += 1;
      throw new Error('must not be called');
    },
  };
  await withServer({ reader, enabled: true, launchAuthorized: true }, async (baseUrl) => {
    for (const body of [
      { ...validBody, providerCode: 'stripe' },
      { ...validBody, actorAccountId: 999 },
      { ...validBody, initiatedBy: 999 },
      { ...validBody, extra: true },
    ]) {
      const response = await fetch(`${baseUrl}/v1/commercial/payment-prepare`, {
        method: 'POST',
        headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }
  });
  assert.equal(calls, 0);
});

test('payment preparation route requires explicit acceptance and valid canonical identifiers', async () => {
  let calls = 0;
  const reader: CommercialConsentPaymentPreparationReader = {
    async prepare() {
      calls += 1;
      throw new Error('must not be called');
    },
  };
  await withServer({ reader, enabled: true, launchAuthorized: true }, async (baseUrl) => {
    for (const body of [
      { ...validBody, accepted: false },
      { ...validBody, businessId: 0 },
      { ...validBody, documentVersionId: '77' },
      { ...validBody, countryId: -1 },
      { ...validBody, idempotencyKey: 'short' },
    ]) {
      const response = await fetch(`${baseUrl}/v1/commercial/payment-prepare`, {
        method: 'POST',
        headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }
  });
  assert.equal(calls, 0);
});

test('payment preparation route maps membership/document denial, conflict and missing version safely', async () => {
  for (const [code, status, error] of [
    ['42501', 403, 'forbidden'],
    ['P0001', 409, 'conflict'],
    ['P0002', 404, 'not_found'],
  ] as const) {
    const reader: CommercialConsentPaymentPreparationReader = {
      async prepare() { throw Object.assign(new Error('sensitive SQL detail'), { code }); },
    };
    await withServer({ reader, enabled: true, launchAuthorized: true }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/commercial/payment-prepare`, {
        method: 'POST',
        headers: { authorization: `Bearer ${sign(99)}`, 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      });
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error });
    });
  }
});

test('payment preparation route requires a verified bearer token', async () => {
  let calls = 0;
  const reader: CommercialConsentPaymentPreparationReader = {
    async prepare() {
      calls += 1;
      throw new Error('must not be called');
    },
  };
  await withServer({ reader, enabled: true, launchAuthorized: true }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/commercial/payment-prepare`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    assert.equal(response.status, 401);
  });
  assert.equal(calls, 0);
});
