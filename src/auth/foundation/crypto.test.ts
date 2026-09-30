import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';
import argon2 from 'argon2';
import {
  normalizeLoginEmail,
  EmailNormalizationError,
} from './email-normalization';
import {
  createArgon2idPasswordHasher,
  ARGON2_MEMORY_KIB,
  ARGON2_TIME_COST,
  ARGON2_PARALLELISM,
} from './password';
import {
  generateOpaqueToken,
  decodeOpaqueTokenWire,
  OPAQUE_TOKEN_BYTES,
} from './opaque-token';
import {
  loadTokenPepper,
  protectOpaqueToken,
  protectedTokensEqual,
  TokenPepperConfigError,
} from './token-hmac';
import { loadEs256Keys, Es256KeyConfigError } from './es256-keys';
import {
  createAccessJwtService,
  AccessJwtError,
  ACCESS_JWT_ISS,
  ACCESS_JWT_AUD,
} from './access-jwt';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

test('email normalization trims whitespace', () => {
  const result = normalizeLoginEmail('  User@Example.COM  ');
  assert.equal(result.loginEmail, 'User@Example.COM');
  assert.equal(result.loginEmailNormalized, 'user@example.com');
});

test('email normalization is deterministic', () => {
  const a = normalizeLoginEmail('Äffé@Example.com');
  const b = normalizeLoginEmail('Äffé@Example.com');
  assert.equal(a.loginEmailNormalized, b.loginEmailNormalized);
});

test('email normalization applies NFKC', () => {
  // ﬁ (U+FB01) NFKC → fi
  const result = normalizeLoginEmail('ﬁsher@Example.com');
  assert.equal(result.loginEmailNormalized, 'fisher@example.com');
});

test('email normalization rejects empty', () => {
  assert.throws(() => normalizeLoginEmail('   '), EmailNormalizationError);
  assert.throws(() => normalizeLoginEmail(''), EmailNormalizationError);
});

test('email normalization rejects overlong input', () => {
  assert.throws(() => normalizeLoginEmail('a'.repeat(321)), EmailNormalizationError);
});

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------

test('password hasher verifies correct password', async () => {
  const hasher = createArgon2idPasswordHasher();
  const hashed = await hasher.hash('CorrectHorseBattery1');
  assert.match(hashed.passwordHash, /^\$argon2id\$/);
  assert.equal(hashed.argon2MemoryKib, ARGON2_MEMORY_KIB);
  const verified = await hasher.verify(hashed.passwordHash, 'CorrectHorseBattery1');
  assert.equal(verified.verified, true);
  assert.equal(verified.needsRehash, false);
});

test('password hasher rejects wrong password', async () => {
  const hasher = createArgon2idPasswordHasher();
  const hashed = await hasher.hash('CorrectHorseBattery1');
  const verified = await hasher.verify(hashed.passwordHash, 'wrong-password');
  assert.equal(verified.verified, false);
  assert.equal(verified.needsRehash, false);
});

test('password hasher fails safely on malformed hash', async () => {
  const hasher = createArgon2idPasswordHasher();
  const verified = await hasher.verify('not-a-valid-phc', 'anything');
  assert.equal(verified.verified, false);
});

test('password hasher signals rehash for weaker stored parameters', async () => {
  const hasher = createArgon2idPasswordHasher();
  const weakHash = await argon2.hash('CorrectHorseBattery1', {
    type: argon2.argon2id,
    memoryCost: 8192,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
  });
  const verified = await hasher.verify(weakHash, 'CorrectHorseBattery1');
  assert.equal(verified.verified, true);
  assert.equal(verified.needsRehash, true);
  assert.equal(ARGON2_TIME_COST, 3);
  assert.equal(ARGON2_PARALLELISM, 1);
});

// ---------------------------------------------------------------------------
// Opaque token + HMAC
// ---------------------------------------------------------------------------

test('opaque tokens are 32-byte unique URL-safe values', () => {
  const a = generateOpaqueToken();
  const b = generateOpaqueToken();
  assert.equal(a.raw.length, OPAQUE_TOKEN_BYTES);
  assert.equal(b.raw.length, OPAQUE_TOKEN_BYTES);
  assert.notEqual(a.wire, b.wire);
  assert.equal(decodeOpaqueTokenWire(a.wire).equals(a.raw), true);
  assert.match(a.wire, /^[A-Za-z0-9_-]+$/);
});

test('HMAC protection is deterministic and pepper-sensitive', () => {
  const pepperA = Buffer.alloc(32, 7);
  const pepperB = Buffer.alloc(32, 9);
  const raw = generateOpaqueToken().raw;
  const h1 = protectOpaqueToken(pepperA, 'refresh', raw);
  const h2 = protectOpaqueToken(pepperA, 'refresh', raw);
  const h3 = protectOpaqueToken(pepperB, 'refresh', raw);
  const h4 = protectOpaqueToken(pepperA, 'recovery', raw);
  assert.equal(protectedTokensEqual(h1, h2), true);
  assert.equal(protectedTokensEqual(h1, h3), false);
  assert.equal(protectedTokensEqual(h1, h4), false);
  assert.equal(h1.includes(raw), false);
});

test('token pepper config fails closed', () => {
  assert.throws(() => loadTokenPepper({}), TokenPepperConfigError);
  assert.throws(() => loadTokenPepper({ GHM_AUTH_TOKEN_PEPPER: 'short' }), TokenPepperConfigError);
});

// ---------------------------------------------------------------------------
// ES256 JWT

test('ES256 access JWT signs and verifies with approved claims', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const keys = loadEs256Keys({
    GHM_JWT_ES256_PRIVATE_KEY_PEM: privateKeyPem,
    GHM_JWT_ES256_PUBLIC_KEY_PEM: publicKeyPem,
    GHM_JWT_ES256_KID: 'ghm-es256-20260921-1',
  });
  const service = createAccessJwtService(keys);
  const token = service.sign(42);
  const verified = service.verify(token);
  assert.equal(verified.accountId, 42);
  assert.equal(verified.kid, 'ghm-es256-20260921-1');
  assert.equal(verified.claims.iss, ACCESS_JWT_ISS);
  assert.equal(verified.claims.aud, ACCESS_JWT_AUD);
  assert.equal(verified.claims.sub, '42');
});

test('ES256 verify rejects wrong algorithm', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const keys = loadEs256Keys({
    GHM_JWT_ES256_PRIVATE_KEY_PEM: privateKeyPem,
    GHM_JWT_ES256_PUBLIC_KEY_PEM: publicKeyPem,
    GHM_JWT_ES256_KID: 'ghm-es256-20260921-1',
  });
  const service = createAccessJwtService(keys);
  const hsToken = jwt.sign(
    { sub: '42', iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD },
    'not-es256-secret',
    { algorithm: 'HS256', keyid: 'ghm-es256-20260921-1', expiresIn: 900 },
  );
  assert.throws(() => service.verify(hsToken), AccessJwtError);
});

test('ES256 verify rejects wrong issuer and audience', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const keys = loadEs256Keys({
    GHM_JWT_ES256_PRIVATE_KEY_PEM: privateKeyPem,
    GHM_JWT_ES256_PUBLIC_KEY_PEM: publicKeyPem,
    GHM_JWT_ES256_KID: 'ghm-es256-20260921-1',
  });
  const badIss = jwt.sign(
    { sub: '42', iss: 'other', aud: ACCESS_JWT_AUD, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 },
    privateKeyPem,
    { algorithm: 'ES256', keyid: 'ghm-es256-20260921-1', noTimestamp: true },
  );
  const badAud = jwt.sign(
    { sub: '42', iss: ACCESS_JWT_ISS, aud: 'other', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 },
    privateKeyPem,
    { algorithm: 'ES256', keyid: 'ghm-es256-20260921-1', noTimestamp: true },
  );
  const service = createAccessJwtService(keys);
  assert.throws(() => service.verify(badIss), AccessJwtError);
  assert.throws(() => service.verify(badAud), AccessJwtError);
});

test('ES256 verify rejects expired, missing kid, unknown kid, and invalid subject', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const keys = loadEs256Keys({
    GHM_JWT_ES256_PRIVATE_KEY_PEM: privateKeyPem,
    GHM_JWT_ES256_PUBLIC_KEY_PEM: publicKeyPem,
    GHM_JWT_ES256_KID: 'ghm-es256-20260921-1',
  });
  const service = createAccessJwtService(keys);

  const expired = jwt.sign(
    { sub: '42', iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD, iat: 1_000_000_000, exp: 1_000_000_100 },
    privateKeyPem,
    { algorithm: 'ES256', keyid: 'ghm-es256-20260921-1', noTimestamp: true },
  );
  assert.throws(() => service.verify(expired), AccessJwtError);

  const noKid = jwt.sign(
    { sub: '42', iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 },
    privateKeyPem,
    { algorithm: 'ES256', noTimestamp: true },
  );
  assert.throws(() => service.verify(noKid), AccessJwtError);

  const unknownKid = jwt.sign(
    { sub: '42', iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 },
    privateKeyPem,
    { algorithm: 'ES256', keyid: 'unknown-kid', noTimestamp: true },
  );
  assert.throws(() => service.verify(unknownKid), AccessJwtError);

  const badSub = jwt.sign(
    { sub: '0', iss: ACCESS_JWT_ISS, aud: ACCESS_JWT_AUD, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 900 },
    privateKeyPem,
    { algorithm: 'ES256', keyid: 'ghm-es256-20260921-1', noTimestamp: true },
  );
  assert.throws(() => service.verify(badSub), AccessJwtError);

  assert.throws(() => loadEs256Keys({}), Es256KeyConfigError);
});
