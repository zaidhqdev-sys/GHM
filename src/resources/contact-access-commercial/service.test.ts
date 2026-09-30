import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type {
  AuthorizeContactAccessCommercialInput,
  ContactAccessCommercialGrantResult,
  ContactAccessCommercialRepository,
} from './contracts';
import { ContactAccessCommercialServiceImpl } from './service';

const businessContext: AuthContext = { userId: 468, role: 'business' };
const customerContext: AuthContext = { userId: 99, role: 'customer' };

const grantResult = (): ContactAccessCommercialGrantResult => ({
  commercialFact: {
    id: 77,
    businessId: 265,
    opportunityId: 501,
    idempotencyKey: 'idem-key-001',
    verificationStatus: 'verified',
    commercialSource: 'ghm_commercial_boundary',
    verifiedByAccountId: 468,
    verifiedAt: new Date('2026-09-23T12:00:00.000Z'),
    createdAt: new Date('2026-09-23T12:00:00.000Z'),
  },
  entitlement: {
    id: 11,
    businessId: 265,
    opportunityId: 501,
    authorizationStatus: 'active',
    grantReason: 'verified_commercial',
    grantSource: 'ghm_commercial_boundary',
    grantedByAccountId: 468,
    grantedAt: new Date('2026-09-23T12:00:00.000Z'),
    commercialEventReference: 'contact_access_commercial_fact:77',
    commercialFactId: 77,
    revokedAt: null,
    revokedByAccountId: null,
    revocationReason: null,
    createdAt: new Date('2026-09-23T12:00:00.000Z'),
    updatedAt: new Date('2026-09-23T12:00:00.000Z'),
  },
});

class FakeRepository implements ContactAccessCommercialRepository {
  lastInput: AuthorizeContactAccessCommercialInput | null = null;

  async authorizeContactAccessFromVerifiedCommercial(
    _context: AuthContext,
    input: AuthorizeContactAccessCommercialInput,
  ): Promise<ContactAccessCommercialGrantResult> {
    this.lastInput = input;
    return grantResult();
  }
}

test('Commercial service requires business role and normalizes source/key', async () => {
  const repository = new FakeRepository();
  const service = new ContactAccessCommercialServiceImpl(repository);
  const result = await service.authorizeContactAccessFromVerifiedCommercial(businessContext, {
    businessId: 265,
    opportunityId: 501,
    idempotencyKey: '  idem-key-001  ',
    commercialSource: '  ghm_commercial_boundary  ',
  });
  assert.equal(repository.lastInput?.idempotencyKey, 'idem-key-001');
  assert.equal(repository.lastInput?.commercialSource, 'ghm_commercial_boundary');
  assert.equal(result.entitlement.grantReason, 'verified_commercial');
  assert.equal(result.entitlement.commercialFactId, 77);
});

test('Commercial service rejects customer role', async () => {
  const service = new ContactAccessCommercialServiceImpl(new FakeRepository());
  await assert.rejects(
    () => service.authorizeContactAccessFromVerifiedCommercial(customerContext, {
      businessId: 265,
      opportunityId: 501,
      idempotencyKey: 'idem-key-001',
      commercialSource: 'ghm_commercial_boundary',
    }),
    /Insufficient role/,
  );
});

test('Commercial service rejects untrusted payment_success signals', async () => {
  const service = new ContactAccessCommercialServiceImpl(new FakeRepository());
  await assert.rejects(
    () => service.authorizeContactAccessFromVerifiedCommercial(businessContext, {
      businessId: 265,
      opportunityId: 501,
      idempotencyKey: 'idem-key-001',
      commercialSource: 'ghm_commercial_boundary',
      payment_success: true,
    } as AuthorizeContactAccessCommercialInput & { payment_success: boolean }),
    /Untrusted payment signals are not accepted/,
  );
});

test('Commercial grant result excludes contact and identity recovery fields', async () => {
  const service = new ContactAccessCommercialServiceImpl(new FakeRepository());
  const result = await service.authorizeContactAccessFromVerifiedCommercial(businessContext, {
    businessId: 265,
    opportunityId: 501,
    idempotencyKey: 'idem-key-001',
    commercialSource: 'ghm_commercial_boundary',
  });
  const encoded = JSON.stringify(result);
  for (const forbidden of ['customerName', 'customerPhone', 'customerEmail', 'customerId', 'creatorAccountId']) {
    assert.equal(encoded.includes(`"${forbidden}"`), false);
  }
});
