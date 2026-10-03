import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { VerifiedQuoteFlowIdentityLinkAttestation } from './identity-link-attestation';
import {
  createGhmAccountConfirmation,
  createGhmBusinessConfirmation,
  decideQuoteFlowAccountLink,
  decideQuoteFlowBusinessLink,
} from './identity-link-decision';

const ghmContext: AuthContext = { userId: 42, role: 'customer' };
const businessContext: AuthContext = { userId: 84, role: 'business' };

const attestation = (sub = '9001'): VerifiedQuoteFlowIdentityLinkAttestation => ({
  kid: 'quoteflow-test-key',
  claims: {
    sub,
    iss: 'quoteflow',
    aud: 'ghm-identity-link',
    ceremony: 'identity-link',
    version: 1,
    iat: 1000,
    exp: 1100,
  },
});

test('account confirmation derives GHM identity from authenticated context', () => {
  assert.deepEqual(createGhmAccountConfirmation(ghmContext), { kind: 'account', actorUserId: 42 });
});

test('account confirmation rejects invalid authenticated identity', () => {
  assert.throws(() => createGhmAccountConfirmation({ userId: 0, role: 'customer' }), /Authentication required/);
});

test('business confirmation requires a resolved authorized Business identity', () => {
  assert.deepEqual(createGhmBusinessConfirmation(businessContext, 7), {
    kind: 'business',
    actorUserId: 84,
    businessId: 7,
  });
  assert.throws(() => createGhmBusinessConfirmation(businessContext, 0), /Authorized GHM Business is required/);
});

test('account link requires both sides and exact principal match', () => {
  assert.deepEqual(
    decideQuoteFlowAccountLink(attestation(), createGhmAccountConfirmation(ghmContext), []),
    { outcome: 'eligible', kind: 'account', quoteFlowIdentityId: '9001', ghmAccountId: 42 },
  );
  assert.deepEqual(
    decideQuoteFlowAccountLink(attestation(), null, []),
    { outcome: 'reject', reason: 'missing-ghm-confirmation' },
  );
  assert.deepEqual(
    decideQuoteFlowAccountLink(attestation('9002'), createGhmAccountConfirmation(ghmContext), []),
    { outcome: 'reject', reason: 'account-principal-mismatch' },
  );
});

test('account link rejects incompatible active mappings but is idempotent for identical mapping', () => {
  const existing = [{ quoteFlowIdentityId: '9001', ghmAccountId: 42 }];
  assert.deepEqual(
    decideQuoteFlowAccountLink(attestation(), createGhmAccountConfirmation(ghmContext), existing),
    { outcome: 'eligible', kind: 'account', quoteFlowIdentityId: '42', ghmAccountId: 42 },
  );
  assert.deepEqual(
    decideQuoteFlowAccountLink(attestation(), createGhmAccountConfirmation(ghmContext), [
      { quoteFlowIdentityId: '9001', ghmAccountId: 99 },
    ]),
    { outcome: 'reject', reason: 'account-link-conflict' },
  );
});

test('business link requires a resolved GHM Business and exact organization mapping', () => {
  assert.deepEqual(
    decideQuoteFlowBusinessLink('org-1', createGhmBusinessConfirmation(businessContext, 7), []),
    { outcome: 'eligible', kind: 'business', quoteFlowOrganizationId: 'org-1', ghmBusinessId: 7 },
  );
  assert.deepEqual(
    decideQuoteFlowBusinessLink('', createGhmBusinessConfirmation(businessContext, 7), []),
    { outcome: 'reject', reason: 'business-organization-missing' },
  );
});

test('business link rejects incompatible active mappings but is idempotent for identical mapping', () => {
  const confirmation = createGhmBusinessConfirmation(businessContext, 7);
  assert.deepEqual(
    decideQuoteFlowBusinessLink('org-1', confirmation, [{ quoteFlowOrganizationId: 'org-1', ghmBusinessId: 7 }]),
    { outcome: 'eligible', kind: 'business', quoteFlowOrganizationId: 'org-1', ghmBusinessId: 7 },
  );
  assert.deepEqual(
    decideQuoteFlowBusinessLink('org-1', confirmation, [{ quoteFlowOrganizationId: 'org-2', ghmBusinessId: 7 }]),
    { outcome: 'reject', reason: 'business-link-conflict' },
  );
});

test('business confirmation cannot be used for account linking', () => {
  const confirmation = createGhmBusinessConfirmation(businessContext, 7);
  assert.deepEqual(
    decideQuoteFlowAccountLink(attestation(), confirmation, []),
    { outcome: 'reject', reason: 'confirmation-kind-mismatch' },
  );
});
