import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createAccessJwtVerifier, ACCESS_JWT_AUD, ACCESS_JWT_ISS } from '../auth/foundation/access-jwt-verifier';
import { createActorGatewayApp } from './app';
import type { ActorIdentityReader } from './actor-identity-reader';
import type { CampaignDirectoryReviewGatewayReader } from './campaign-directory-review-reader';
import type { Campaign } from '../resources/campaign/contracts';
import type { DirectoryReviewPresentation } from '../resources/directory-review/contracts';

const pair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const privateKeyPem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKeyPem = pair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const kid = 'ghm-campaign-gateway-test';
const verifier = createAccessJwtVerifier(new Map([[kid, publicKeyPem]]));
const token = (accountId: number) => {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({ sub: String(accountId), iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD, iat: now, exp: now + 300 },
    privateKeyPem, { algorithm: 'ES256', keyid: kid });
};

const campaign: Campaign = {
  id: 11, businessId: 22, createdByAccountId: 42, title: 'Campaign',
  status: 'draft', createdAt: new Date('2026-11-12T00:00:00Z'), updatedAt: new Date('2026-11-12T00:00:00Z'),
};
const presentation: DirectoryReviewPresentation = {
  business_id: 22, verification_status: 'unverified', is_verified: false,
  directory_review_submitted_at: null, directory_review_last_reason: null, directory_review_last_event_type: null,
};

const run = async (work: (baseUrl: string, calls: unknown[]) => Promise<void>) => {
  const calls: unknown[] = [];
  const reader: CampaignDirectoryReviewGatewayReader = {
    async createCampaign(actor, input) { calls.push({ operation: 'create', actor, input }); return campaign; },
    async updateCampaign(actor, id, input) { calls.push({ operation: 'update', actor, id, input }); return campaign; },
    async getDirectoryReviewPresentation(actor, businessId) { calls.push({ operation: 'presentation', actor, businessId }); return presentation; },
  };
  const server = http.createServer(createActorGatewayApp({
    verifier,
    actorIdentityReader: {} as ActorIdentityReader,
    campaignDirectoryReviewReader: reader,
  }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try { await work(`http://127.0.0.1:${address.port}`, calls); }
  finally { await new Promise<void>(resolve => server.close(() => resolve())); }
};

test('Campaign create/update and owner review presentation use only verified JWT actor identity', async () => {
  await run(async (baseUrl, calls) => {
    const headers = { authorization: `Bearer ${token(42)}`, 'content-type': 'application/json' };
    const created = await fetch(`${baseUrl}/v1/campaigns`, {
      method: 'POST', headers, body: JSON.stringify({ businessId: 22, title: 'Campaign' }),
    });
    assert.equal(created.status, 201);
    assert.deepEqual(calls[0], { operation: 'create', actor: 42, input: { businessId: 22, title: 'Campaign' } });

    const spoofed = await fetch(`${baseUrl}/v1/campaigns`, {
      method: 'POST', headers, body: JSON.stringify({ businessId: 22, title: 'Campaign', actorId: 99 }),
    });
    assert.equal(spoofed.status, 400);
    assert.equal(calls.length, 1);

    const updated = await fetch(`${baseUrl}/v1/campaigns/11`, {
      method: 'PATCH', headers, body: JSON.stringify({ title: 'Revised' }),
    });
    assert.equal(updated.status, 200);
    assert.deepEqual(calls[1], { operation: 'update', actor: 42, id: 11, input: { title: 'Revised' } });

    const review = await fetch(`${baseUrl}/v1/businesses/22/directory-review-presentation`, {
      headers: { authorization: `Bearer ${token(42)}` },
    });
    assert.equal(review.status, 200);
    assert.deepEqual(calls[2], { operation: 'presentation', actor: 42, businessId: 22 });
    assert.deepEqual((await review.json() as { review: DirectoryReviewPresentation }).review, presentation);
  });
});

test('Campaign and directory-review gateway routes reject invalid bearer tokens', async () => {
  await run(async baseUrl => {
    const response = await fetch(`${baseUrl}/v1/businesses/22/directory-review-presentation`, {
      headers: { authorization: 'Bearer invalid' },
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  });
});
