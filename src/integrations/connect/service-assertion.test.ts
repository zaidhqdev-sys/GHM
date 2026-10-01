import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import {
  CONNECT_SERVICE_ASSERTION_AUD,
  CONNECT_SERVICE_ASSERTION_CLOCK_SKEW_SECONDS,
  CONNECT_SERVICE_ASSERTION_ISS,
  CONNECT_SERVICE_ASSERTION_TTL_SECONDS,
  ConnectServiceAssertionError,
  createConnectServiceAssertionService,
} from './service-assertion';
import type { LoadedEs256Keys } from '../../auth/foundation/es256-keys';

const makeKeys = (): LoadedEs256Keys => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return {
    active: {
      privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      kid: 'connect-active-test',
    },
    previous: null,
  };
};

test('service assertion signs and verifies a Connect integration identity', () => {
  const service = createConnectServiceAssertionService(makeKeys());
  const token = service.sign({ integrationId: 'connect-prod', requestId: 'request-001' }, 1_000);
  const verified = service.verify(token, 1_001);

  assert.equal(verified.integrationId, 'connect-prod');
  assert.equal(verified.requestId, 'request-001');
  assert.equal(verified.claims.iss, CONNECT_SERVICE_ASSERTION_ISS);
  assert.equal(verified.claims.aud, CONNECT_SERVICE_ASSERTION_AUD);
  assert.equal(verified.claims.iat, 1_000);
  assert.equal(verified.claims.exp, 1_000 + CONNECT_SERVICE_ASSERTION_TTL_SECONDS);
});

test('service assertion rejects wrong issuer, audience, and algorithm', () => {
  const keys = makeKeys();
  const service = createConnectServiceAssertionService(keys);

  const wrongIssuer = jwt.sign(
    { sub: 'connect-prod', iss: 'wrong', aud: CONNECT_SERVICE_ASSERTION_AUD, iat: 1_000, exp: 1_100, jti: 'jti-1' },
    keys.active.privateKeyPem,
    { algorithm: 'ES256', keyid: keys.active.kid, noTimestamp: true },
  );
  assert.throws(() => service.verify(wrongIssuer, 1_001), ConnectServiceAssertionError);

  const wrongAudience = jwt.sign(
    { sub: 'connect-prod', iss: CONNECT_SERVICE_ASSERTION_ISS, aud: 'wrong', iat: 1_000, exp: 1_100, jti: 'jti-2' },
    keys.active.privateKeyPem,
    { algorithm: 'ES256', keyid: keys.active.kid, noTimestamp: true },
  );
  assert.throws(() => service.verify(wrongAudience, 1_001), ConnectServiceAssertionError);

  const wrongAlgorithm = jwt.sign(
    { sub: 'connect-prod', iss: CONNECT_SERVICE_ASSERTION_ISS, aud: CONNECT_SERVICE_ASSERTION_AUD, iat: 1_000, exp: 1_100, jti: 'jti-3' },
    'not-a-key',
    { algorithm: 'HS256', keyid: keys.active.kid, noTimestamp: true },
  );
  assert.throws(() => service.verify(wrongAlgorithm, 1_001), ConnectServiceAssertionError);
});

test('service assertion rejects unknown kid and expired assertion', () => {
  const keys = makeKeys();
  const service = createConnectServiceAssertionService(keys);

  const unknownKid = jwt.sign(
    { sub: 'connect-prod', iss: CONNECT_SERVICE_ASSERTION_ISS, aud: CONNECT_SERVICE_ASSERTION_AUD, iat: 1_000, exp: 1_100, jti: 'jti-4' },
    keys.active.privateKeyPem,
    { algorithm: 'ES256', keyid: 'retired-key', noTimestamp: true },
  );
  assert.throws(() => service.verify(unknownKid, 1_001), ConnectServiceAssertionError);

  const expired = service.sign({ integrationId: 'connect-prod', requestId: 'jti-5' }, 1_000);
  assert.throws(() => service.verify(expired, 1_000 + CONNECT_SERVICE_ASSERTION_TTL_SECONDS + CONNECT_SERVICE_ASSERTION_CLOCK_SKEW_SECONDS + 1), ConnectServiceAssertionError);
});

test('service assertion rejects malformed identity, request id, and excessive lifetime', () => {
  const keys = makeKeys();
  const service = createConnectServiceAssertionService(keys);

  assert.throws(() => service.sign({ integrationId: '', requestId: 'jti' }, 1_000), ConnectServiceAssertionError);
  assert.throws(() => service.sign({ integrationId: 'connect', requestId: '' }, 1_000), ConnectServiceAssertionError);

  const excessive = jwt.sign(
    { sub: 'connect-prod', iss: CONNECT_SERVICE_ASSERTION_ISS, aud: CONNECT_SERVICE_ASSERTION_AUD, iat: 1_000, exp: 1_000 + CONNECT_SERVICE_ASSERTION_TTL_SECONDS + 1, jti: 'jti-6' },
    keys.active.privateKeyPem,
    { algorithm: 'ES256', keyid: keys.active.kid, noTimestamp: true },
  );
  assert.throws(() => service.verify(excessive, 1_001), ConnectServiceAssertionError);
});

test('service assertion supports the previous verification key during rotation', () => {
  const active = makeKeys();
  const previous = makeKeys();
  const keys: LoadedEs256Keys = {
    active: active.active,
    previous: { publicKeyPem: previous.active.publicKeyPem, kid: previous.active.kid },
  };
  const service = createConnectServiceAssertionService(keys);
  const token = jwt.sign(
    { sub: 'connect-prod', iss: CONNECT_SERVICE_ASSERTION_ISS, aud: CONNECT_SERVICE_ASSERTION_AUD, iat: 1_000, exp: 1_100, jti: 'jti-7' },
    previous.active.privateKeyPem,
    { algorithm: 'ES256', keyid: previous.active.kid },
  );

  assert.equal(service.verify(token, 1_001).integrationId, 'connect-prod');
});
