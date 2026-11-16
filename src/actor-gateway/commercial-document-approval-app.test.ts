import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createAccessJwtVerifier, ACCESS_JWT_AUD, ACCESS_JWT_ISS } from '../auth/foundation/access-jwt-verifier';
import { createActorGatewayApp } from './app';
import type { ActorIdentityReader } from './actor-identity-reader';
import type { CommercialDocumentApprovalReader } from './commercial-document-approval-reader';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const kid = 'ghm-commercial-approval-test-1';
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
  reader: CommercialDocumentApprovalReader,
  work: (baseUrl: string) => Promise<void>,
): Promise<void> => {
  const actorIdentityReader: ActorIdentityReader = {
    async readOwnIdentity(accountId) { return { accountId, role: 'business', fullName: null }; },
  };
  const server = http.createServer(createActorGatewayApp({
    verifier,
    actorIdentityReader,
    commercialDocumentApprovalReader: reader,
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not start');
  try { await work(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
};

const validBody = { documentVersionId: 77, reason: 'Owner approved exact version' };

test('document approval route derives approver exclusively from verified bearer token', async () => {
  const calls: Array<{ actor: number; documentVersionId: number; reason: string }> = [];
  const reader: CommercialDocumentApprovalReader = {
    async approve(actor, input) {
      calls.push({ actor, ...input });
      return { statusEventId: 501, documentVersionId: input.documentVersionId, authorityEventId: 301, status: 'approved' };
    },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/owner/commercial-document-approval`, {
      method: 'POST',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      approval: { statusEventId: 501, documentVersionId: 77, authorityEventId: 301, status: 'approved' },
    });
  });
  assert.deepEqual(calls, [{ actor: 42, documentVersionId: 77, reason: 'Owner approved exact version' }]);
});

test('document approval route rejects caller-supplied approver identity and extra fields', async () => {
  let calls = 0;
  const reader: CommercialDocumentApprovalReader = {
    async approve() {
      calls += 1;
      return { statusEventId: 501, documentVersionId: 77, authorityEventId: 301, status: 'approved' };
    },
  };
  await withServer(reader, async (baseUrl) => {
    for (const body of [
      { ...validBody, actorAccountId: 999 },
      { ...validBody, approverAccountId: 999 },
      { ...validBody, extra: true },
    ]) {
      const response = await fetch(`${baseUrl}/v1/owner/commercial-document-approval`, {
        method: 'POST',
        headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }
  });
  assert.equal(calls, 0);
});

test('document approval route validates version and reason before database access', async () => {
  let calls = 0;
  const reader: CommercialDocumentApprovalReader = {
    async approve() {
      calls += 1;
      return { statusEventId: 501, documentVersionId: 77, authorityEventId: 301, status: 'approved' };
    },
  };
  await withServer(reader, async (baseUrl) => {
    for (const body of [
      { ...validBody, documentVersionId: 0 },
      { ...validBody, documentVersionId: '77' },
      { ...validBody, reason: '  ' },
      { ...validBody, reason: 'x'.repeat(1001) },
    ]) {
      const response = await fetch(`${baseUrl}/v1/owner/commercial-document-approval`, {
        method: 'POST',
        headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }
  });
  assert.equal(calls, 0);
});

test('document approval route maps founder denial, conflicts and missing version safely', async () => {
  for (const [code, status, error] of [
    ['42501', 403, 'forbidden'],
    ['P0001', 409, 'conflict'],
    ['P0002', 404, 'not_found'],
  ] as const) {
    const reader: CommercialDocumentApprovalReader = {
      async approve() { throw Object.assign(new Error('sensitive SQL detail'), { code }); },
    };
    await withServer(reader, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/v1/owner/commercial-document-approval`, {
        method: 'POST',
        headers: { authorization: `Bearer ${sign(99)}`, 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      });
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error });
    });
  }
});

test('document approval route requires a verified bearer token', async () => {
  let calls = 0;
  const reader: CommercialDocumentApprovalReader = {
    async approve() {
      calls += 1;
      return { statusEventId: 501, documentVersionId: 77, authorityEventId: 301, status: 'approved' };
    },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/owner/commercial-document-approval`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    assert.equal(response.status, 401);
  });
  assert.equal(calls, 0);
});
