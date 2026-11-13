import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { createAccessJwtVerifier } from '../auth/foundation/access-jwt-verifier';
import { ACCESS_JWT_AUD, ACCESS_JWT_ISS } from '../auth/foundation/access-jwt-verifier';
import { createActorGatewayApp } from './app';
import type { ActorIdentity, ActorIdentityReader } from './actor-identity-reader';
import type { BusinessRegistrationIdentityReader } from './business-registration-identity-reader';
import type { SupplierClassificationReader } from './supplier-classification-reader';
import type { BusinessProfileReader } from './business-profile-reader';
import type { SavedBusinessGatewayReader } from './saved-business-reader';
import type { ConnectBusinessProvisioningReader } from '../integrations/connect/business-provisioning-contracts';
import type { StorageMetadataGatewayReader } from './storage-metadata-reader';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const kid = 'ghm-actor-gateway-test-1';
const verifier = createAccessJwtVerifier(new Map([[kid, publicKeyPem]]));

const sign = (accountId: number, overrides: Record<string, unknown> = {}): string => {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: String(accountId),
      iss: ACCESS_JWT_ISS,
      aud: ACCESS_JWT_AUD,
      iat: now,
      exp: now + 900,
      ...overrides,
    },
    privateKeyPem,
    { algorithm: 'ES256', keyid: kid },
  );
};

const withServer = async (
  reader: ActorIdentityReader,
  work: (baseUrl: string) => Promise<void>,
  businessRegistrationIdentityReader?: BusinessRegistrationIdentityReader,
  capabilityGovernanceReader?: import('./capability-governance-reader').CapabilityGovernanceReader,
  supplierClassificationReader?: SupplierClassificationReader,
  businessProfileReader?: BusinessProfileReader,
  options: import('./app').ActorGatewayAppOptions = {},
  requestVerifier: import('../auth/foundation/access-jwt-verifier').AccessJwtVerifier = verifier,
  businessCapabilityMutationReader?: import('./business-capability-mutation-reader').GatewayCapabilityMutationReader,
  savedBusinessReader?: SavedBusinessGatewayReader,
  connectBusinessProvisioningReader?: ConnectBusinessProvisioningReader,
  storageMetadataReader?: StorageMetadataGatewayReader,
): Promise<void> => {
  const server = http.createServer(createActorGatewayApp({
    verifier: requestVerifier,
    actorIdentityReader: reader,
    businessRegistrationIdentityReader,
    capabilityGovernanceReader,
    supplierClassificationReader,
    businessProfileReader,
    businessCapabilityMutationReader,
    savedBusinessReader,
    connectBusinessProvisioningReader,
    storageMetadataReader,
  }, options));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Actor gateway test server did not start');
  try {
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

test('actor gateway health endpoint is process-only and does not query actor identity', async () => {
  let calls = 0;
  const reader: ActorIdentityReader = {
    async readOwnIdentity(): Promise<ActorIdentity> {
      calls += 1;
      throw new Error('must not be called');
    },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
  });
  assert.equal(calls, 0);
});

test('actor gateway rate limits each verified account without trusting caller-supplied identity', async () => {
  const calls: number[] = [];
  const reader: ActorIdentityReader = {
    async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
      calls.push(accountId);
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  };
  await withServer(reader, async (baseUrl) => {
    const request = (accountId: number) => fetch(`${baseUrl}/v1/actor/me`, {
      headers: { authorization: `Bearer ${sign(accountId)}` },
    });
    const first = await request(42);
    assert.equal(first.status, 200);
    const second = await request(42);
    assert.equal(second.status, 200);
    const limited = await request(42);
    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), { error: 'rate_limited' });

    const otherAccount = await request(43);
    assert.equal(otherAccount.status, 200);

    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
  }, undefined, undefined, undefined, undefined, { rateLimitLimit: 2, rateLimitWindowMs: 60_000 });
  assert.deepEqual(calls, [42, 42, 43]);
});

test('actor gateway verifies each bearer token once and reuses its verified account identity', async () => {
  let verifications = 0;
  const countingVerifier = {
    verify(token: string) {
      verifications += 1;
      return verifier.verify(token);
    },
  };
  const received: number[] = [];
  const reader: ActorIdentityReader = {
    async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
      received.push(accountId);
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/actor/me`, {
      headers: { authorization: `Bearer ${sign(42)}` },
    });
    assert.equal(response.status, 200);
  }, undefined, undefined, undefined, undefined, {}, countingVerifier);
  assert.equal(verifications, 1);
  assert.deepEqual(received, [42]);
});

test('actor gateway rejects missing and invalid bearer tokens before database access', async () => {
  let calls = 0;
  const reader: ActorIdentityReader = {
    async readOwnIdentity(): Promise<ActorIdentity> {
      calls += 1;
      return { accountId: 42, role: 'business', fullName: 'Test Actor' };
    },
  };
  await withServer(reader, async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/v1/actor/me`);
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { error: 'unauthorized' });

    const invalid = await fetch(`${baseUrl}/v1/actor/me`, {
      headers: { authorization: 'Bearer not-a-valid-token' },
    });
    assert.equal(invalid.status, 401);
    assert.deepEqual(await invalid.json(), { error: 'unauthorized' });
  });
  assert.equal(calls, 0);
});

test('actor gateway derives actor identity from verified token sub, not request input', async () => {
  const received: number[] = [];
  const reader: ActorIdentityReader = {
    async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
      received.push(accountId);
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/actor/me?accountId=999`, {
      headers: { authorization: `Bearer ${sign(42)}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      actor: { accountId: 42, role: 'business', fullName: 'Verified Actor' },
    });
  });
  assert.deepEqual(received, [42]);
});

test('actor gateway rejects database-denied or disabled actors without leaking SQL errors', async () => {
  const reader: ActorIdentityReader = {
    async readOwnIdentity(): Promise<ActorIdentity> {
      throw Object.assign(new Error('sensitive SQL detail must not be returned'), { code: '42501' });
    },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/actor/me`, {
      headers: { authorization: `Bearer ${sign(42)}` },
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  });
});

test('actor gateway fails closed when the database is unavailable', async () => {
  const reader: ActorIdentityReader = {
    async readOwnIdentity(): Promise<ActorIdentity> {
      throw Object.assign(new Error('database connection string must not leak'), { code: '08006' });
    },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/actor/me`, {
      headers: { authorization: `Bearer ${sign(42)}` },
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'service_unavailable' });
  });
});


test('actor gateway registration identity read derives account ID from token and business ID from typed path', async () => {
  const received: Array<{ accountId: number; businessId: number }> = [];
  const reader: ActorIdentityReader = {
    async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  };
  const businessReader: BusinessRegistrationIdentityReader = {
    async readRegistrationIdentity(accountId: number, businessId: number) {
      received.push({ accountId, businessId });
      return {
        businessId,
        registrationStatus: 'registered',
        registrationNumber: 'REG-123',
        legalName: 'Example Legal Entity',
        updatedAt: new Date('2026-11-10T20:00:00.000Z'),
      };
    },
    async updateRegistrationIdentity() { throw new Error('not used in read test'); },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/businesses/77/registration-identity?accountId=999`, {
      headers: { authorization: `Bearer ${sign(42)}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      registrationIdentity: {
        businessId: 77,
        registrationStatus: 'registered',
        registrationNumber: 'REG-123',
        legalName: 'Example Legal Entity',
        updatedAt: '2026-11-10T20:00:00.000Z',
      },
    });
  }, businessReader);
  assert.deepEqual(received, [{ accountId: 42, businessId: 77 }]);
});

test('actor gateway registration identity read rejects invalid business IDs before database access', async () => {
  let calls = 0;
  const reader: ActorIdentityReader = {
    async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  };
  const businessReader: BusinessRegistrationIdentityReader = {
    async readRegistrationIdentity() {
      calls += 1;
      return {
        businessId: 1,
        registrationStatus: null,
        registrationNumber: null,
        legalName: null,
        updatedAt: null,
      };
    },
    async updateRegistrationIdentity() { throw new Error('not used in read test'); },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/businesses/0/registration-identity`, {
      headers: { authorization: `Bearer ${sign(42)}` },
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
  }, businessReader);
  assert.equal(calls, 0);
});

test('actor gateway hides registration identity membership denials as not found', async () => {
  const reader: ActorIdentityReader = {
    async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  };
  const businessReader: BusinessRegistrationIdentityReader = {
    async readRegistrationIdentity() {
      throw Object.assign(new Error('Business management permission required'), { code: '42501' });
    },
    async updateRegistrationIdentity() { throw new Error('not used in read test'); },
  };
  await withServer(reader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/businesses/77/registration-identity`, {
      headers: { authorization: `Bearer ${sign(42)}` },
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  }, businessReader);
});


test('actor gateway registration identity write binds actor to verified token and validates the typed payload', async () => {
  const received: Array<{ accountId: number; input: { businessId: number; registrationStatus: 'registered' | 'unregistered' | null; registrationNumber: string | null; legalName: string | null } }> = [];
  const identityReader: ActorIdentityReader = {
    async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  };
  const businessReader: BusinessRegistrationIdentityReader = {
    async readRegistrationIdentity(accountId: number, businessId: number) {
      return { businessId, registrationStatus: null, registrationNumber: null, legalName: null, updatedAt: null };
    },
    async updateRegistrationIdentity(accountId, input) {
      received.push({ accountId, input });
      return {
        businessId: input.businessId,
        registrationStatus: input.registrationStatus,
        registrationNumber: input.registrationNumber,
        legalName: input.legalName,
        updatedAt: new Date('2026-11-10T20:00:00.000Z'),
      };
    },
  };
  await withServer(identityReader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/businesses/77/registration-identity?accountId=999`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        registrationStatus: 'registered',
        registrationNumber: 'REG-77',
        legalName: 'Example Legal Entity',
      }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      registrationIdentity: {
        businessId: 77,
        registrationStatus: 'registered',
        registrationNumber: 'REG-77',
        legalName: 'Example Legal Entity',
        updatedAt: '2026-11-10T20:00:00.000Z',
      },
    });
  }, businessReader);
  assert.deepEqual(received, [{
    accountId: 42,
    input: {
      businessId: 77,
      registrationStatus: 'registered',
      registrationNumber: 'REG-77',
      legalName: 'Example Legal Entity',
    },
  }]);
});

test('actor gateway registration identity write rejects malformed payloads before database access', async () => {
  let calls = 0;
  const identityReader: ActorIdentityReader = {
    async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  };
  const businessReader: BusinessRegistrationIdentityReader = {
    async readRegistrationIdentity() {
      return { businessId: 1, registrationStatus: null, registrationNumber: null, legalName: null, updatedAt: null };
    },
    async updateRegistrationIdentity() {
      calls += 1;
      throw new Error('must not be called');
    },
  };
  await withServer(identityReader, async (baseUrl) => {
    for (const body of [
      { registrationStatus: 'registered', registrationNumber: 'REG-1' },
      { registrationStatus: 'approved', registrationNumber: null, legalName: null },
      { registrationStatus: 'unregistered', registrationNumber: 'REG-1', legalName: null },
      { registrationStatus: null, registrationNumber: null, legalName: null, accountId: 999 },
    ]) {
      const response = await fetch(`${baseUrl}/v1/businesses/77/registration-identity`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }
  }, businessReader);
  assert.equal(calls, 0);
});

test('actor gateway registration identity write hides membership denial as not found', async () => {
  const identityReader: ActorIdentityReader = {
    async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  };
  const businessReader: BusinessRegistrationIdentityReader = {
    async readRegistrationIdentity() {
      return { businessId: 1, registrationStatus: null, registrationNumber: null, legalName: null, updatedAt: null };
    },
    async updateRegistrationIdentity() {
      throw Object.assign(new Error('Business management permission required'), { code: '42501' });
    },
  };
  await withServer(identityReader, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/businesses/77/registration-identity`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ registrationStatus: null, registrationNumber: null, legalName: null }),
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  }, businessReader);
});


test('actor gateway capability administration derives the actor only from verified token subject', async () => {
  const received: Array<{operation:string;accountId:number}> = [];
  const capability = {
    id:'11111111-1111-4111-8111-111111111111',parentId:null,name:'Example',slug:'example',description:null,
    sortOrder:0,lifecycleStatus:'draft' as const,taxonomyVersion:1,effectiveFrom:null,effectiveTo:null,
    sourceAuthority:'GHM System Administration',sourceReference:null,replacedByCapabilityId:null,isSelectable:false,
    createdAt:new Date('2026-11-10T20:00:00.000Z'),updatedAt:new Date('2026-11-10T20:00:00.000Z'),
  };
  const capabilityReader = {
    async list(accountId:number){received.push({operation:'list',accountId});return [capability];},
    async createDraft(accountId:number,input:unknown){received.push({operation:'create',accountId});return capability;},
    async updateDraft(accountId:number,id:string,input:unknown){received.push({operation:'update',accountId});return capability;},
    async transition(accountId:number,id:string,status:string,replacementId?:string|null){received.push({operation:'transition',accountId});return capability;},
  };
  const identityReader: ActorIdentityReader = {
    async readOwnIdentity(accountId:number):Promise<ActorIdentity>{return {accountId,role:'admin',fullName:'Verified Admin'};},
  };
  await withServer(identityReader, async baseUrl => {
    const response=await fetch(`${baseUrl}/v1/admin/capabilities?accountId=999`,{headers:{authorization:`Bearer ${sign(42)}`}});
    assert.equal(response.status,200);
    const payload=await response.json() as {capabilities:Array<{id:string}>};
    assert.equal(payload.capabilities[0].id,capability.id);
    const missing=await fetch(`${baseUrl}/v1/admin/capabilities`);
    assert.equal(missing.status,401);
  }, undefined, capabilityReader as never);
  assert.deepEqual(received,[{operation:'list',accountId:42}]);
});

test('supplier classification gateway derives actor from verified token subject', async () => {
  const calls: Array<{ accountId: number; businessId: number; isSupplier: boolean }> = [];
  const reader: SupplierClassificationReader = {
    async updateSupplierClassification(accountId, businessId, isSupplier) {
      calls.push({ accountId, businessId, isSupplier });
      return { businessId, isSupplier };
    },
  };
  await withServer({
    async readOwnIdentity(accountId): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/businesses/73/supplier-classification?accountId=999`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ isSupplier: true }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { supplierClassification: { businessId: 73, isSupplier: true } });
    const invalid = await fetch(`${baseUrl}/v1/businesses/73/supplier-classification`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ isSupplier: false, accountId: 999 }),
    });
    assert.equal(invalid.status, 400);
  }, undefined, undefined, reader);
  assert.deepEqual(calls, [{ accountId: 42, businessId: 73, isSupplier: true }]);
});

test('supplier classification gateway rejects missing bearer token before database access', async () => {
  let calls = 0;
  const reader: SupplierClassificationReader = {
    async updateSupplierClassification() {
      calls += 1;
      return { businessId: 73, isSupplier: true };
    },
  };
  await withServer({
    async readOwnIdentity(accountId): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: null };
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/businesses/73/supplier-classification`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isSupplier: true }),
    });
    assert.equal(response.status, 401);
  }, undefined, undefined, reader);
  assert.equal(calls, 0);
});

test('Business profile gateway derives actor from verified token subject', async () => {
  const calls: Array<{ accountId: number; businessId: number; patch: Record<string, unknown> }> = [];
  const reader: BusinessProfileReader = {
    async updateBusinessProfile(accountId, businessId, patch) {
      calls.push({ accountId, businessId, patch });
      return { businessId };
    },
  };
  await withServer({
    async readOwnIdentity(accountId): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/businesses/73/profile`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Updated name', physicalAddress: 'Durban', accountId: 999 }),
    });
    assert.equal(response.status, 400);
    const supplierViaProfile = await fetch(`${baseUrl}/v1/businesses/73/profile`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ isSupplier: true }),
    });
    assert.equal(supplierViaProfile.status, 400);
    const valid = await fetch(`${baseUrl}/v1/businesses/73/profile`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Updated name', physicalAddress: 'Durban' }),
    });
    assert.equal(valid.status, 200);
    assert.deepEqual(await valid.json(), { businessProfile: { businessId: 73 } });
  }, undefined, undefined, undefined, reader);
  assert.deepEqual(calls, [{ accountId: 42, businessId: 73, patch: { name: 'Updated name', physicalAddress: 'Durban' } }]);
});

test('Business profile gateway rejects missing bearer token before database access', async () => {
  let calls = 0;
  const reader: BusinessProfileReader = {
    async updateBusinessProfile(_accountId, businessId) {
      calls += 1;
      return { businessId };
    },
  };
  await withServer({
    async readOwnIdentity(accountId): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: null };
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/businesses/73/profile`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Updated name' }),
    });
    assert.equal(response.status, 401);
  }, undefined, undefined, undefined, reader);
  assert.equal(calls, 0);
});

test('actor gateway derives evidence submitter from verified bearer token',async()=>{
 let received:any;
 const identity:ActorIdentityReader={async readOwnIdentity(accountId){return{accountId,role:'business',fullName:'Actor'}}};
 const mutation:import('./business-capability-mutation-reader').GatewayCapabilityMutationReader={
  async replace(){return[]},async verify(){throw new Error('unused')},async reviewEvidence(){throw new Error('unused')},
  async submitEvidence(actor,input){received={actor,input};return{} as never;}
 };
 await withServer(identity,async baseUrl=>{
  const response=await fetch(`${baseUrl}/v1/business-capability-evidence`,{method:'POST',headers:{authorization:`Bearer ${sign(42)}`,'content-type':'application/json'},body:JSON.stringify({businessCapabilityId:12,evidenceType:'certification',title:'Certificate'})});
  assert.equal(response.status,201);
 },undefined,undefined,undefined,undefined,{},verifier,mutation);
 assert.equal(received.actor,42);assert.equal(received.input.businessCapabilityId,12);
});
test('actor gateway rejects evidence submitter identity and unknown fields from request body',async()=>{
 let called=false;
 const identity:ActorIdentityReader={async readOwnIdentity(accountId){return{accountId,role:'business',fullName:'Actor'}}};
 const mutation:import('./business-capability-mutation-reader').GatewayCapabilityMutationReader={
  async replace(){return[]},async verify(){throw new Error('unused')},async reviewEvidence(){throw new Error('unused')},async submitEvidence(){called=true;return{} as never;}
 };
 await withServer(identity,async baseUrl=>{
  const response=await fetch(`${baseUrl}/v1/business-capability-evidence`,{method:'POST',headers:{authorization:`Bearer ${sign(42)}`,'content-type':'application/json'},body:JSON.stringify({businessCapabilityId:12,evidenceType:'certification',title:'Certificate',submittedBy:999})});
  assert.equal(response.status,400);
 },undefined,undefined,undefined,undefined,{},verifier,mutation);
 assert.equal(called,false);
});


test('saved business gateway derives owner from verified JWT and rejects caller-supplied account fields', async () => {
  const calls: Array<{ operation: string; actor: number; id?: number }> = [];
  const reader: SavedBusinessGatewayReader = {
    async list(actor) {
      calls.push({ operation: 'list', actor });
      return [{ id: 1, accountId: actor, businessId: 77, createdAt: new Date('2026-11-11T00:00:00.000Z') }];
    },
    async get(actor, id) {
      calls.push({ operation: 'get', actor, id });
      return null;
    },
    async create(actor, businessId) {
      calls.push({ operation: 'create', actor, id: businessId });
      return { id: 2, accountId: actor, businessId, createdAt: new Date('2026-11-11T00:00:00.000Z') };
    },
    async delete(actor, id) {
      calls.push({ operation: 'delete', actor, id });
      return true;
    },
  };

  await withServer({
    async readOwnIdentity(accountId) {
      return { accountId, role: 'customer', fullName: 'Test' };
    },
  }, async (baseUrl) => {
    const headers = { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' };
    const list = await fetch(`${baseUrl}/v1/saved-businesses?accountId=999`, { headers });
    assert.equal(list.status, 200);
    const listBody = await list.json() as { savedBusinesses: Array<{ accountId: number }> };
    assert.equal(listBody.savedBusinesses[0].accountId, 42);

    const create = await fetch(`${baseUrl}/v1/saved-businesses`, {
      method: 'POST', headers, body: JSON.stringify({ businessId: 77, accountId: 999 }),
    });
    assert.equal(create.status, 400);

    const validCreate = await fetch(`${baseUrl}/v1/saved-businesses`, {
      method: 'POST', headers, body: JSON.stringify({ businessId: 77 }),
    });
    assert.equal(validCreate.status, 201);
    const created = await validCreate.json() as { savedBusiness: { accountId: number } };
    assert.equal(created.savedBusiness.accountId, 42);

    const get = await fetch(`${baseUrl}/v1/saved-businesses/12`, { headers });
    assert.equal(get.status, 404);

    const remove = await fetch(`${baseUrl}/v1/saved-businesses/12`, { method: 'DELETE', headers });
    assert.equal(remove.status, 204);
  }, undefined, undefined, undefined, undefined, {}, verifier, undefined, reader);

  assert.deepEqual(calls, [
    { operation: 'list', actor: 42 },
    { operation: 'create', actor: 42, id: 77 },
    { operation: 'get', actor: 42, id: 12 },
    { operation: 'delete', actor: 42, id: 12 },
  ]);
});

test('Connect Business provisioning route uses the verified actor and denies non-membership without fallback', async () => {
  const calls: Array<{ accountId: number; externalBusinessId: string; name: string }> = [];
  const reader: ConnectBusinessProvisioningReader = {
    async provisionOrResolve(accountId, input) {
      calls.push({ accountId, ...input });
      if (accountId === 43) throw Object.assign(new Error('Business membership required'), { code: '42501' });
      return {
        outcome: 'provisioned',
        business: { id: 42 } as any,
        mapping: {
          id: 9, provider: 'supabase', externalBusinessId: input.externalBusinessId,
          businessId: 42, createdAt: new Date(0), updatedAt: new Date(0),
        },
      };
    },
  };
  const externalBusinessId = '11111111-1111-4111-8111-111111111111';
  await withServer({
    async readOwnIdentity(accountId: number): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Verified Actor' };
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/connect/businesses/provision-or-resolve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ externalBusinessId, name: 'Acme Construction' }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json() as { outcome: string; mapping: { businessId: number } };
    assert.equal(payload.outcome, 'provisioned');
    assert.equal(payload.mapping.businessId, 42);

    const denied = await fetch(`${baseUrl}/v1/connect/businesses/provision-or-resolve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${sign(43)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ externalBusinessId, name: 'Acme Construction' }),
    });
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { error: 'forbidden' });

    const invalid = await fetch(`${baseUrl}/v1/connect/businesses/provision-or-resolve`, {
      method: 'POST',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ externalBusinessId, name: 'Acme Construction', businessId: 99 }),
    });
    assert.equal(invalid.status, 400);
  }, undefined, undefined, undefined, undefined, {}, verifier, undefined, undefined, reader);
  assert.deepEqual(calls, [
    { accountId: 42, externalBusinessId, name: 'Acme Construction' },
    { accountId: 43, externalBusinessId, name: 'Acme Construction' },
  ]);
});



test('storage metadata create route derives actor from token and fixes Business Logo metadata policy', async () => {
  const received: Array<{ actor: number; input: unknown }> = [];
  const storageReader: StorageMetadataGatewayReader = {
    async createPending(actor, input) { received.push({ actor, input }); return { id: '8' } as never; },
    async getObject() { return null; },
    async markDeletionPending() { throw new Error('not used'); },
    async markAvailable() { throw new Error('not used'); },
    async markDeleted() { throw new Error('not used'); },
  };
  await withServer({
    async readOwnIdentity(accountId): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Actor' };
    },
  }, async baseUrl => {
    const response = await fetch(`${baseUrl}/v1/storage/metadata?accountId=999`, {
      method: 'POST',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        businessId: 73, resourceId: 73, providerKey: 'media/logos/73/550e8400-e29b-41d4-a716-446655440000',
        contentType: 'image/png', byteSize: 1024, originalFilename: null,
      }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { object: { id: '8' } });
  }, undefined, undefined, undefined, undefined, {}, verifier, undefined, undefined, undefined, storageReader);
  assert.equal(received[0].actor, 42);
  assert.deepEqual(received[0].input, {
    businessId: 73, resourceType: 'business', resourceId: 73, objectClass: 'business_logo',
    providerKey: 'media/logos/73/550e8400-e29b-41d4-a716-446655440000',
    contentType: 'image/png', byteSize: 1024, visibility: 'public', originalFilename: null,
  });
});

test('storage metadata create rejects cross-tenant provider keys and malformed metadata before reader access', async () => {
  let calls = 0;
  const storageReader: StorageMetadataGatewayReader = {
    async createPending() { calls += 1; throw new Error('must not be called'); },
    async getObject() { return null; },
    async markDeletionPending() { throw new Error('must not be called'); },
    async markAvailable() { throw new Error('must not be called'); },
    async markDeleted() { throw new Error('must not be called'); },
  };
  await withServer({
    async readOwnIdentity(accountId): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Actor' };
    },
  }, async baseUrl => {
    const response = await fetch(`${baseUrl}/v1/storage/metadata`, {
      method: 'POST',
      headers: { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        businessId: 73, resourceId: 73, providerKey: 'media/logos/74/550e8400-e29b-41d4-a716-446655440000',
        contentType: 'image/png', byteSize: 1024, originalFilename: null,
      }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
  }, undefined, undefined, undefined, undefined, {}, verifier, undefined, undefined, undefined, storageReader);
  assert.equal(calls, 0);
});

test('storage metadata read and deletion routes bind actor to verified token and object path', async () => {
  const calls: Array<{ operation: string; actor: number; objectId: number }> = [];
  const storageReader: StorageMetadataGatewayReader = {
    async createPending() { throw new Error('not used'); },
    async getObject(actor, objectId) { calls.push({ operation: 'read', actor, objectId }); return { id: String(objectId), status: 'available' } as never; },
    async markDeletionPending(actor, objectId) { calls.push({ operation: 'delete', actor, objectId }); return { id: String(objectId), status: 'deletion_pending' } as never; },
    async markAvailable() { throw new Error('not used'); },
    async markDeleted() { throw new Error('not used'); },
  };
  await withServer({
    async readOwnIdentity(accountId): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Actor' };
    },
  }, async baseUrl => {
    const headers = { authorization: `Bearer ${sign(42)}` };
    const read = await fetch(`${baseUrl}/v1/storage/metadata/81?accountId=999`, { headers });
    assert.equal(read.status, 200);
    const remove = await fetch(`${baseUrl}/v1/storage/metadata/81/deletion-pending`, { method: 'POST', headers });
    assert.equal(remove.status, 200);
    const invalid = await fetch(`${baseUrl}/v1/storage/metadata/0`, { headers });
    assert.equal(invalid.status, 400);
  }, undefined, undefined, undefined, undefined, {}, verifier, undefined, undefined, undefined, storageReader);
  assert.deepEqual(calls, [
    { operation: 'read', actor: 42, objectId: 81 },
    { operation: 'delete', actor: 42, objectId: 81 },
  ]);
});


test('provider transition routes require a typed one-use attestation and forward the verified actor', async () => {
  const calls: Array<{ operation: string; actor: number; objectId: number; attestation: unknown }> = [];
  const attestation = {
    issuedAt: Math.floor(Date.now() / 1000),
    nonce: '550e8400-e29b-41d4-a716-446655440000',
    context: JSON.stringify({ businessId: 73, objectId: 81, providerKey: 'media/logos/73/550e8400-e29b-41d4-a716-446655440000' }),
    signature: 'a'.repeat(64),
  };
  const storageReader: StorageMetadataGatewayReader = {
    async createPending() { throw new Error('not used'); },
    async getObject() { return null; },
    async markDeletionPending() { throw new Error('not used'); },
    async markAvailable(actor, objectId, _checksum, _providerKey, _contentType, _byteSize, proof) {
      calls.push({ operation: 'available', actor, objectId, attestation: proof });
      return { id: String(objectId), status: 'available' } as never;
    },
    async markDeleted(actor, objectId, _providerKey, proof) {
      calls.push({ operation: 'deleted', actor, objectId, attestation: proof });
      return { id: String(objectId), status: 'deleted' } as never;
    },
  };
  await withServer({
    async readOwnIdentity(accountId): Promise<ActorIdentity> {
      return { accountId, role: 'business', fullName: 'Actor' };
    },
  }, async baseUrl => {
    const headers = { authorization: `Bearer ${sign(42)}`, 'content-type': 'application/json' };
    const available = await fetch(`${baseUrl}/v1/storage/metadata/81/available`, {
      method: 'POST', headers,
      body: JSON.stringify({
        checksum: 'sha256:abc', providerKey: 'media/logos/73/550e8400-e29b-41d4-a716-446655440000',
        contentType: 'image/png', byteSize: 1024, attestation,
      }),
    });
    assert.equal(available.status, 200);
    const deleted = await fetch(`${baseUrl}/v1/storage/metadata/81/deleted`, {
      method: 'POST', headers,
      body: JSON.stringify({ providerKey: 'media/logos/73/550e8400-e29b-41d4-a716-446655440000', attestation }),
    });
    assert.equal(deleted.status, 200);
    const invalid = await fetch(`${baseUrl}/v1/storage/metadata/81/available`, {
      method: 'POST', headers,
      body: JSON.stringify({
        checksum: null, providerKey: 'media/logos/73/object', contentType: 'image/png', byteSize: 1,
        attestation: { ...attestation, signature: 'invalid' },
      }),
    });
    assert.equal(invalid.status, 400);
  }, undefined, undefined, undefined, undefined, {}, verifier, undefined, undefined, undefined, storageReader);
  assert.deepEqual(calls.map(call => [call.operation, call.actor, call.objectId]), [
    ['available', 42, 81],
    ['deleted', 42, 81],
  ]);
  assert.deepEqual(calls[0].attestation, attestation);
});
