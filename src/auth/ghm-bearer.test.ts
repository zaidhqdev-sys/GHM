import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { loadEs256Keys } from './foundation/es256-keys';
import { createAccessJwtService, ACCESS_JWT_ISS, ACCESS_JWT_AUD } from './foundation/access-jwt';
import {
  createGhmBearerAuthenticatorWithKeys,
  GhmBearerAuthError,
  type AccountAuthStateStore,
} from './ghm-bearer';
import { toLegacyAuthContext } from './ghm-auth-context';

const makeKeys = (kid = 'ghm-es256-20260921-1', previous?: { kid: string }) => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const env: NodeJS.ProcessEnv = {
    GHM_JWT_ES256_PRIVATE_KEY_PEM: privateKeyPem,
    GHM_JWT_ES256_PUBLIC_KEY_PEM: publicKeyPem,
    GHM_JWT_ES256_KID: kid,
  };
  let previousPair: { privateKeyPem: string; publicKeyPem: string; kid: string } | null = null;
  if (previous) {
    const prev = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    previousPair = {
      privateKeyPem: prev.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      publicKeyPem: prev.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      kid: previous.kid,
    };
    env.GHM_JWT_ES256_PREVIOUS_PUBLIC_KEY_PEM = previousPair.publicKeyPem;
    env.GHM_JWT_ES256_PREVIOUS_KID = previous.kid;
  }
  return { keys: loadEs256Keys(env), privateKeyPem, publicKeyPem, previousPair };
};

const requestWithBearer = (token?: string): Request =>
  ({
    header: (name: string) =>
      name.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : undefined,
  }) as Request;

const activeStore = (accountId = 42): AccountAuthStateStore => ({
  async getAccountAuthState(id) {
    if (id !== accountId) return null;
    return { accountId, accountStatus: 'active', role: 'customer', isSystemAdmin: false };
  },
});

test('ghm bearer accepts valid ES256 token for active account', async () => {
  const { keys } = makeKeys();
  const jwtService = createAccessJwtService(keys);
  const authenticator = createGhmBearerAuthenticatorWithKeys(keys, activeStore(42));
  const token = jwtService.sign(42);
  const context = await authenticator.authenticate(requestWithBearer(token));
  assert.equal(context.accountId, 42);
  const legacy = toLegacyAuthContext(context, 'customer');
  assert.deepEqual(legacy, { userId: 42, role: 'customer' });
});

test('ghm bearer rejects wrong algorithm, issuer, audience, kid, exp, sub', async () => {
  const { keys, privateKeyPem } = makeKeys();
  const authenticator = createGhmBearerAuthenticatorWithKeys(keys, activeStore(42));

  const hs = jwt.sign(
    { sub: '42', iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD },
    'secret',
    { algorithm: 'HS256', keyid: 'ghm-es256-20260921-1', expiresIn: 900 },
  );
  await assert.rejects(() => authenticator.authenticate(requestWithBearer(hs)), GhmBearerAuthError);

  const badIss = jwt.sign(
    { sub: '42', iss: 'other', aud: ACCESS_JWT_AUD, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 },
    privateKeyPem,
    { algorithm: 'ES256', keyid: 'ghm-es256-20260921-1', noTimestamp: true },
  );
  await assert.rejects(() => authenticator.authenticate(requestWithBearer(badIss)), GhmBearerAuthError);

  const badAud = jwt.sign(
    { sub: '42', iss: ACCESS_JWT_ISS, aud: 'other', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 },
    privateKeyPem,
    { algorithm: 'ES256', keyid: 'ghm-es256-20260921-1', noTimestamp: true },
  );
  await assert.rejects(() => authenticator.authenticate(requestWithBearer(badAud)), GhmBearerAuthError);

  const noKid = jwt.sign(
    { sub: '42', iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 },
    privateKeyPem,
    { algorithm: 'ES256', noTimestamp: true },
  );
  await assert.rejects(() => authenticator.authenticate(requestWithBearer(noKid)), GhmBearerAuthError);

  const unknownKid = jwt.sign(
    { sub: '42', iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 },
    privateKeyPem,
    { algorithm: 'ES256', keyid: 'unknown', noTimestamp: true },
  );
  await assert.rejects(() => authenticator.authenticate(requestWithBearer(unknownKid)), GhmBearerAuthError);

  const expired = jwt.sign(
    { sub: '42', iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD, iat: 1_000_000_000, exp: 1_000_000_100 },
    privateKeyPem,
    { algorithm: 'ES256', keyid: 'ghm-es256-20260921-1', noTimestamp: true },
  );
  await assert.rejects(() => authenticator.authenticate(requestWithBearer(expired)), GhmBearerAuthError);

  const badSub = jwt.sign(
    { sub: '0', iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 },
    privateKeyPem,
    { algorithm: 'ES256', keyid: 'ghm-es256-20260921-1', noTimestamp: true },
  );
  await assert.rejects(() => authenticator.authenticate(requestWithBearer(badSub)), GhmBearerAuthError);
});

test('ghm bearer rejects disabled and unknown accounts without distinction', async () => {
  const { keys } = makeKeys();
  const jwtService = createAccessJwtService(keys);
  const token = jwtService.sign(99);

  const disabled: AccountAuthStateStore = {
    async getAccountAuthState() {
      return { accountId: 99, accountStatus: 'disabled', role: 'customer', isSystemAdmin: false };
    },
  };
  const missing: AccountAuthStateStore = {
    async getAccountAuthState() {
      return null;
    },
  };

  await assert.rejects(
    () => createGhmBearerAuthenticatorWithKeys(keys, disabled).authenticate(requestWithBearer(token)),
    GhmBearerAuthError,
  );
  await assert.rejects(
    () => createGhmBearerAuthenticatorWithKeys(keys, missing).authenticate(requestWithBearer(token)),
    GhmBearerAuthError,
  );
});

test('ghm bearer accepts previous rotation key within overlap', async () => {
  const { keys, previousPair } = makeKeys('ghm-es256-20260921-2', { kid: 'ghm-es256-20260921-1' });
  assert.ok(previousPair);
  const authenticator = createGhmBearerAuthenticatorWithKeys(keys, activeStore(7));
  const token = jwt.sign(
    { sub: '7', iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 },
    previousPair!.privateKeyPem,
    { algorithm: 'ES256', keyid: previousPair!.kid, noTimestamp: true },
  );
  const context = await authenticator.authenticate(requestWithBearer(token));
  assert.equal(context.accountId, 7);
});

test('ghm bearer rejects missing Authorization header', async () => {
  const { keys } = makeKeys();
  const authenticator = createGhmBearerAuthenticatorWithKeys(keys, activeStore());
  await assert.rejects(() => authenticator.authenticate(requestWithBearer()), GhmBearerAuthError);
});
