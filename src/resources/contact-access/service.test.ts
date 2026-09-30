import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type {
  ContactAccessCheckResult,
  ContactAccessEntitlement,
  ContactAccessRepository,
  ContactDisclosure,
  GrantContactAccessInput,
  RevokeContactAccessInput,
} from './contracts';
import { ContactAccessServiceImpl } from './service';

const businessContext: AuthContext = { userId: 468, role: 'business' };
const customerContext: AuthContext = { userId: 99, role: 'customer' };
const adminContext: AuthContext = { userId: 1, role: 'admin' };

const entitlement = (overrides: Partial<ContactAccessEntitlement> = {}): ContactAccessEntitlement => ({
  id: 11,
  businessId: 265,
  opportunityId: 501,
  authorizationStatus: 'active',
  grantReason: 'manual_promotional',
  grantSource: 'founder_promo',
  grantedByAccountId: 468,
  grantedAt: new Date('2026-09-23T10:00:00.000Z'),
  commercialEventReference: null,
  commercialFactId: null,
  revokedAt: null,
  revokedByAccountId: null,
  revocationReason: null,
  createdAt: new Date('2026-09-23T10:00:00.000Z'),
  updatedAt: new Date('2026-09-23T10:00:00.000Z'),
  ...overrides,
});

class FakeRepository implements ContactAccessRepository {
  lastGrant: GrantContactAccessInput | null = null;
  lastRevoke: RevokeContactAccessInput | null = null;
  lastDisclose: { businessId: number; opportunityId: number } | null = null;
  checkResult: ContactAccessCheckResult = {
    businessId: 265,
    opportunityId: 501,
    status: 'active',
    entitlement: entitlement(),
  };
  membershipError: Error | null = null;
  discloseError: Error | null = null;
  disclosure: ContactDisclosure = {
    customerName: 'Customer One',
    customerPhone: '+27123456789',
    customerEmail: 'customer@example.com',
  };
  discloseCallCount = 0;

  async grantContactAccess(_context: AuthContext, input: GrantContactAccessInput): Promise<ContactAccessEntitlement> {
    this.lastGrant = input;
    return entitlement({ grantSource: input.grantSource });
  }

  async getContactAccess(
    _context: AuthContext,
    businessId: number,
    opportunityId: number,
  ): Promise<ContactAccessCheckResult> {
    if (this.membershipError) throw this.membershipError;
    return { ...this.checkResult, businessId, opportunityId };
  }

  async revokeContactAccess(_context: AuthContext, input: RevokeContactAccessInput): Promise<ContactAccessEntitlement> {
    this.lastRevoke = input;
    return entitlement({
      authorizationStatus: 'revoked',
      revokedAt: new Date('2026-09-23T11:00:00.000Z'),
      revokedByAccountId: 468,
      revocationReason: input.revocationReason,
    });
  }

  async discloseContactAccess(
    _context: AuthContext,
    businessId: number,
    opportunityId: number,
  ): Promise<ContactDisclosure> {
    this.discloseCallCount += 1;
    this.lastDisclose = { businessId, opportunityId };
    if (this.membershipError) throw this.membershipError;
    if (this.discloseError) throw this.discloseError;
    return this.disclosure;
  }
}

const assertDisclosureShape = (value: ContactDisclosure): void => {
  assert.deepEqual(Object.keys(value).sort(), ['customerEmail', 'customerName', 'customerPhone']);
  const encoded = JSON.stringify(value);
  assert.equal(encoded.includes('customerId'), false);
  assert.equal(encoded.includes('creatorAccountId'), false);
  assert.equal(encoded.includes('accountId'), false);
  assert.equal(encoded.includes('entitlement'), false);
  assert.equal(encoded.includes('authorizationStatus'), false);
};

const assertNoContactFieldsOnEntitlement = (value: unknown): void => {
  const encoded = JSON.stringify(value);
  for (const forbidden of [
    'customerPhone',
    'customerEmail',
    'customerName',
    'customerId',
    'creatorAccountId',
  ]) {
    assert.equal(encoded.includes(`"${forbidden}"`), false, `must not contain ${forbidden}`);
  }
};

const createService = (repository = new FakeRepository()) =>
  new ContactAccessServiceImpl(repository);

test('Service grant requires business role and normalizes promotional source', async () => {
  const repository = new FakeRepository();
  const service = createService(repository);
  const result = await service.grantContactAccess(businessContext, {
    businessId: 265,
    opportunityId: 501,
    grantReason: 'manual_promotional',
    grantSource: '  founder_promo  ',
  });
  assert.equal(repository.lastGrant?.grantSource, 'founder_promo');
  assert.equal(result.authorizationStatus, 'active');
  assertNoContactFieldsOnEntitlement(result);
});

test('Service grant rejects customer and admin roles', async () => {
  const service = createService();
  const input = {
    businessId: 265,
    opportunityId: 501,
    grantReason: 'manual_promotional' as const,
    grantSource: 'founder_promo',
  };
  await assert.rejects(() => service.grantContactAccess(customerContext, input), /Insufficient role/);
  await assert.rejects(() => service.grantContactAccess(adminContext, input), /Insufficient role/);
});

test('Service grant rejects non-manual_promotional reasons', async () => {
  const service = createService();
  await assert.rejects(
    () => service.grantContactAccess(businessContext, {
      businessId: 265,
      opportunityId: 501,
      grantReason: 'payment' as 'manual_promotional',
      grantSource: 'paystack',
    }),
    /Use the verified commercial authorization path for commercial Contact Access grants/,
  );
});

test('Service check requires business role and returns status without contact fields', async () => {
  const service = createService();
  const result = await service.getContactAccess(businessContext, 265, 501);
  assert.equal(result.status, 'active');
  assertNoContactFieldsOnEntitlement(result);
  await assert.rejects(() => service.getContactAccess(customerContext, 265, 501), /Insufficient role/);
});

test('Service revoke requires business role and records reason', async () => {
  const repository = new FakeRepository();
  const service = createService(repository);
  const result = await service.revokeContactAccess(businessContext, {
    businessId: 265,
    opportunityId: 501,
    revocationReason: '  fraud_review  ',
  });
  assert.equal(repository.lastRevoke?.revocationReason, 'fraud_review');
  assert.equal(result.authorizationStatus, 'revoked');
  assertNoContactFieldsOnEntitlement(result);
});

test('Service grant documents owner and administrator as the permitted management roles', async () => {
  const repository = new FakeRepository();
  const service = createService(repository);
  await service.grantContactAccess(businessContext, {
    businessId: 265,
    opportunityId: 501,
    grantReason: 'manual_promotional',
    grantSource: 'owner_or_admin_path',
  });
  assert.equal(repository.lastGrant?.businessId, 265);
  assert.equal(repository.lastGrant?.opportunityId, 501);
});

test('Disclose returns live name/phone/email when Contact Access is active', async () => {
  const repository = new FakeRepository();
  const service = createService(repository);
  const result = await service.discloseContactAccess(businessContext, 265, 501);
  assert.deepEqual(result, {
    customerName: 'Customer One',
    customerPhone: '+27123456789',
    customerEmail: 'customer@example.com',
  });
  assertDisclosureShape(result);
  assert.deepEqual(repository.lastDisclose, { businessId: 265, opportunityId: 501 });
});

test('Disclose denies absent Contact Access', async () => {
  const repository = new FakeRepository();
  repository.discloseError = new Error('Contact Access disclosure denied');
  const service = createService(repository);
  await assert.rejects(() => service.discloseContactAccess(businessContext, 265, 501), /Contact Access disclosure denied/);
});

test('Disclose denies revoked Contact Access', async () => {
  const repository = new FakeRepository();
  repository.discloseError = new Error('Contact Access disclosure denied');
  const service = createService(repository);
  await assert.rejects(() => service.discloseContactAccess(businessContext, 265, 501), /Contact Access disclosure denied/);
});

test('Disclose denies inactive Business membership', async () => {
  const repository = new FakeRepository();
  repository.membershipError = new Error('Business read permission required');
  const service = createService(repository);
  await assert.rejects(
    () => service.discloseContactAccess(businessContext, 265, 501),
    /Business read permission required/,
  );
});

test('Disclose denies non-Business and customer roles', async () => {
  const service = createService();
  await assert.rejects(() => service.discloseContactAccess(customerContext, 265, 501), /Insufficient role/);
  await assert.rejects(() => service.discloseContactAccess(adminContext, 265, 501), /Insufficient role/);
});

test('Disclose fails closed for cross-Business or missing Enquiry association', async () => {
  const repository = new FakeRepository();
  repository.discloseError = new Error('Opportunity Enquiry association not found');
  const service = createService(repository);
  await assert.rejects(
    () => service.discloseContactAccess(businessContext, 265, 501),
    /Opportunity Enquiry association not found/,
  );
});

test('Disclose DTO excludes customerId and creatorAccountId', async () => {
  const service = createService();
  const result = await service.discloseContactAccess(businessContext, 265, 501);
  assertDisclosureShape(result);
  assert.equal('customerId' in result, false);
  assert.equal('creatorAccountId' in result, false);
});

test('Disclose reflects live Enquiry contact mutation on subsequent call', async () => {
  const repository = new FakeRepository();
  const service = createService(repository);
  const first = await service.discloseContactAccess(businessContext, 265, 501);
  assert.equal(first.customerPhone, '+27123456789');
  repository.disclosure = {
    customerName: 'Customer One',
    customerPhone: '+27999888777',
    customerEmail: 'updated@example.com',
  };
  const second = await service.discloseContactAccess(businessContext, 265, 501);
  assert.deepEqual(second, {
    customerName: 'Customer One',
    customerPhone: '+27999888777',
    customerEmail: 'updated@example.com',
  });
  assertDisclosureShape(second);
});

test('Disclose rejects wrong Opportunity scope at the repository boundary', async () => {
  const repository = new FakeRepository();
  repository.discloseError = new Error('Contact Access disclosure denied');
  const service = createService(repository);
  await assert.rejects(() => service.discloseContactAccess(businessContext, 265, 999), /Contact Access disclosure denied/);
  assert.deepEqual(repository.lastDisclose, { businessId: 265, opportunityId: 999 });
});

test('Contact Access entitlement/check responses remain contact-free after Slice B', async () => {
  const service = createService();
  const granted = await service.grantContactAccess(businessContext, {
    businessId: 265,
    opportunityId: 501,
    grantReason: 'manual_promotional',
    grantSource: 'founder_promo',
  });
  const checked = await service.getContactAccess(businessContext, 265, 501);
  assertNoContactFieldsOnEntitlement(granted);
  assertNoContactFieldsOnEntitlement(checked);
});
