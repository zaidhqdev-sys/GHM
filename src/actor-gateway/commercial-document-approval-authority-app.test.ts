import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createAccessJwtVerifier, ACCESS_JWT_AUD, ACCESS_JWT_ISS } from '../auth/foundation/access-jwt-verifier';
import { createActorGatewayApp } from './app';
import type { ActorIdentityReader } from './actor-identity-reader';
import type {
  CommercialDocumentApprovalAuthorityReader,
  ManageCommercialDocumentApprovalAuthorityInput,
} from './commercial-document-approval-authority-reader';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const kid = 'ghm-commercial-authority-test-1';
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
  reader: CommercialDocumentApprovalAuthorityReader,
  work: (baseUrl: string) => Promise<void>,
): Promise<void> => {
  const actorIdentityReader: ActorIdentityReader = {
    async readOwnIdentity(accountId) {
      return { accountId, role: 'business', fullName: null };
    },
  };
  const server = http.createServer(createActorGatewayApp({
    verifier,
    actorIdentityReader,
    commercialDocumentApprovalAuthorityReader: reader,
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not start');
  try {
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

const validBody = {
  action: 'grant',
  documentType: 'trial_terms',
  documentKey: 'zaid-business-pro-trial',
  jurisdictionCountryId: null,
  reason: 'Owner approved the trial terms authority',
};

test('owner authority route derives the actor from the verified bearer token', async () => {
  const calls: Array<{ actor: number; input: ManageCommercialDocumentApprovalAuthorityInput }> = [];
  const reader: CommercialDocumentApprovalAuthorityReader = {
    async manage(actor, input) {
      calls.push({ actor, input });
      return { authorityId: 'authority-1', authorityEventId: 10, eventType: 'granted' };
    },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/owner/commercial-document-approval-authority`, {
      method: 'POST',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ...validBody, reason: '  Owner approved the trial terms authority  ' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      authority: { authorityId: 'authority-1', authorityEventId: 10, eventType: 'granted' },
    });
  });
  assert.deepEqual(calls, [{
    actor: 42,
    input: { ...validBody, reason: 'Owner approved the trial terms authority' },
  }]);
});

test('owner authority route rejects caller-supplied actor or approver identity fields', async () => {
  let calls = 0;
  const reader: CommercialDocumentApprovalAuthorityReader = {
    async manage() {
      calls += 1;
      return { authorityId: 'authority-1', authorityEventId: 10, eventType: 'granted' };
    },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/owner/commercial-document-approval-authority`, {
      method: 'POST',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ...validBody, actorAccountId: 999, approverAccountId: 999 }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
  });
  assert.equal(calls, 0);
});

test('owner authority route rejects invalid document scope and reason before database access', async () => {
  let calls = 0;
  const reader: CommercialDocumentApprovalAuthorityReader = {
    async manage() {
      calls += 1;
      return { authorityId: 'authority-1', authorityEventId: 10, eventType: 'granted' };
    },
  };
  await withServer(reader, async (baseUrl) => {
    for (const body of [
      { ...validBody, documentKey: 'Invalid Key' },
      { ...validBody, documentType: 'other_terms' },
      { ...validBody, action: 'approve' },
      { ...validBody, jurisdictionCountryId: 0 },
      { ...validBody, reason: '   ' },
      { ...validBody, extra: true },
    ]) {
      const response = await fetch(`${baseUrl}/v1/owner/commercial-document-approval-authority`, {
        method: 'POST',
        headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }
  });
  assert.equal(calls, 0);
});

test('owner authority route maps founder authorization denial to forbidden', async () => {
  const reader: CommercialDocumentApprovalAuthorityReader = {
    async manage() {
      throw Object.assign(new Error('sensitive database detail'), { code: '42501' });
    },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/owner/commercial-document-approval-authority`, {
      method: 'POST',
      headers: { authorization: `Bearer ${sign(99)}`, 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'forbidden' });
  });
});

test('owner authority route maps duplicate or invalid state transitions to conflict', async () => {
  const reader: CommercialDocumentApprovalAuthorityReader = {
    async manage() {
      throw Object.assign(new Error('sensitive database detail'), { code: 'P0001' });
    },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/owner/commercial-document-approval-authority`, {
      method: 'POST',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'conflict' });
  });
});

test('owner authority route rejects missing bearer token before calling reader', async () => {
  let calls = 0;
  const reader: CommercialDocumentApprovalAuthorityReader = {
    async manage() {
      calls += 1;
      return { authorityId: 'authority-1', authorityEventId: 10, eventType: 'granted' };
    },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/owner/commercial-document-approval-authority`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    assert.equal(response.status, 401);
  });
  assert.equal(calls, 0);
});
