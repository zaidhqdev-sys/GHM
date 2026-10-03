import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import {
  createQuoteFlowIdentityLinkAttestationVerifier,
  QuoteFlowAttestationError,
  QUOTEFLOW_ATTESTATION_AUDIENCE,
  QUOTEFLOW_ATTESTATION_CEREMONY,
  QUOTEFLOW_ATTESTATION_ISSUER,
  QUOTEFLOW_ATTESTATION_VERSION,
} from './identity-link-attestation';
import type { LoadedEs256Keys } from '../../auth/foundation/es256-keys';

const keyPair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const privateKeyPem = keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKeyPem = keyPair.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const keys: LoadedEs256Keys = {
  active: { privateKeyPem, publicKeyPem, kid: 'qf-test-1' },
  previous: null,
};
const verifier = createQuoteFlowIdentityLinkAttestationVerifier(keys);
const now = Math.floor(Date.now() / 1000);

const sign = (overrides: Record<string, unknown> = {}, kid = keys.active.kid): string =>
  jwt.sign({
    sub: '42',
    iss: QUOTEFLOW_ATTESTATION_ISSUER,
    aud: QUOTEFLOW_ATTESTATION_AUDIENCE,
    ceremony: QUOTEFLOW_ATTESTATION_CEREMONY,
    version: QUOTEFLOW_ATTESTATION_VERSION,
    iat: now,
    exp: now + 300,
    ...overrides,
  }, privateKeyPem, { algorithm: 'ES256', keyid: kid, noTimestamp: true });

test('accepts a valid QuoteFlow identity-link attestation', () => {
  const result = verifier.verify(sign());
  assert.equal(result.kid, 'qf-test-1');
  assert.equal(result.claims.sub, '42');
  assert.equal(result.claims.ceremony, 'identity-link');
  assert.equal(result.claims.version, 1);
});

test('rejects wrong issuer', () => {
  assert.throws(() => verifier.verify(sign({ iss: 'ghm-auth' })), QuoteFlowAttestationError);
});

test('rejects wrong audience', () => {
  assert.throws(() => verifier.verify(sign({ aud: 'ghm-api' })), QuoteFlowAttestationError);
});

test('rejects wrong ceremony', () => {
  assert.throws(() => verifier.verify(sign({ ceremony: 'other' })), QuoteFlowAttestationError);
});

test('rejects wrong version', () => {
  assert.throws(() => verifier.verify(sign({ version: 2 })), QuoteFlowAttestationError);
});

test('rejects unknown kid', () => {
  assert.throws(() => verifier.verify(sign({}, 'unknown')), QuoteFlowAttestationError);
});

test('rejects non-ES256 tokens', () => {
  const token = jwt.sign({ sub: '42' }, privateKeyPem, { algorithm: 'ES256', keyid: 'qf-test-1', noTimestamp: true });
  const parts = token.split('.');
  const header = Buffer.from(parts[0], 'base64url').toString('utf8').replace('ES256', 'HS256');
  const forged = [Buffer.from(header).toString('base64url'), parts[1], parts[2]].join('.');
  assert.throws(() => verifier.verify(forged), QuoteFlowAttestationError);
});

test('rejects malformed subject', () => {
  assert.throws(() => verifier.verify(sign({ sub: '0' })), QuoteFlowAttestationError);
});

test('rejects invalid timestamp ordering', () => {
  assert.throws(() => verifier.verify(sign({ iat: now + 10, exp: now + 5 })), QuoteFlowAttestationError);
});
