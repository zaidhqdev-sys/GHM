import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type {
  BusinessCapability,
  BusinessCapabilityRepository,
  CreateBusinessCapabilityInput,
} from './contracts';
import { BusinessCapabilityServiceImpl } from './service';

const capability = (id: number, businessId: number, capabilityId = '11111111-1111-4111-8111-111111111111'): BusinessCapability => ({
  id,
  businessId,
  capabilityId,
  proficiencyLevel: 'proficient',
  description: 'Construction services',
  assertionStatus: 'active',
  assertionBasis: 'self_declared',
  verificationStatus: 'unverified',
  effectiveFrom: new Date('2026-09-16T00:00:00.000Z'),
  effectiveUntil: null,
  sourceReference: null,
  submittedAt: new Date('2026-09-16T00:00:00.000Z'),
  verifiedBy: null,
  verifiedAt: null,
  verificationReason: null,
  createdBy: 10,
  createdAt: new Date('2026-09-16T00:00:00.000Z'),
  updatedAt: new Date('2026-09-16T00:00:00.000Z'),
});

class FakeRepository implements BusinessCapabilityRepository {
  receivedContext: AuthContext | null = null;
  receivedCreate: CreateBusinessCapabilityInput | null = null;
  rows = new Map<number, BusinessCapability>();

  async createBusinessCapability(context: AuthContext, input: CreateBusinessCapabilityInput): Promise<BusinessCapability> {
    this.receivedContext = context;
    this.receivedCreate = input;
    const created = capability(1, input.businessId, input.capabilityId);
    this.rows.set(created.id, created);
    return created;
  }

  async getBusinessCapability(context: AuthContext, businessCapabilityId: number): Promise<BusinessCapability | null> {
    this.receivedContext = context;
    return this.rows.get(businessCapabilityId) ?? null;
  }

  async listBusinessCapabilities(context: AuthContext, businessId: number): Promise<BusinessCapability[]> {
    this.receivedContext = context;
    return [...this.rows.values()].filter((row) => row.businessId === businessId);
  }
}

const context: AuthContext = { userId: 10, role: 'business' };
const validInput: CreateBusinessCapabilityInput = {
  businessId: 12,
  capabilityId: '11111111-1111-4111-8111-111111111111',
  proficiencyLevel: 'proficient',
  description: '  Construction services  ',
  sourceReference: '  internal-profile  ',
  effectiveFrom: new Date('2026-09-16T00:00:00.000Z'),
  effectiveUntil: new Date('2026-12-16T00:00:00.000Z'),
};

test('Business Capability creation passes authenticated context and narrowed input', async () => {
  const repository = new FakeRepository();
  const service = new BusinessCapabilityServiceImpl(repository);
  const created = await service.createBusinessCapability(context, validInput);

  assert.equal(repository.receivedContext, context);
  assert.equal(repository.receivedCreate, validInput);
  assert.equal(created.businessId, 12);
  assert.equal(created.capabilityId, validInput.capabilityId);
});

test('Business Capability creation rejects invalid input before repository execution', async () => {
  const repository = new FakeRepository();
  const service = new BusinessCapabilityServiceImpl(repository);

  await assert.rejects(() => service.createBusinessCapability(context, null as never), /input is required/);
  await assert.rejects(() => service.createBusinessCapability(context, { ...validInput, businessId: 0 }), /businessId must be a positive integer/);
  await assert.rejects(() => service.createBusinessCapability(context, { ...validInput, capabilityId: 'not-a-uuid' }), /valid UUID/);
  await assert.rejects(() => service.createBusinessCapability(context, { ...validInput, proficiencyLevel: 'master' as never }), /Invalid proficiency level/);
  await assert.rejects(() => service.createBusinessCapability(context, { ...validInput, description: '   ' }), /Description must contain between 1 and 1000 characters/);
  await assert.rejects(() => service.createBusinessCapability(context, { ...validInput, description: 'x'.repeat(1001) }), /Description must contain between 1 and 1000 characters/);
  await assert.rejects(() => service.createBusinessCapability(context, { ...validInput, sourceReference: '   ' }), /Source reference must contain between 1 and 500 characters/);
  await assert.rejects(() => service.createBusinessCapability(context, { ...validInput, sourceReference: 'x'.repeat(501) }), /Source reference must contain between 1 and 500 characters/);
  await assert.rejects(() => service.createBusinessCapability(context, { ...validInput, effectiveFrom: new Date('invalid') }), /Invalid effective-from date/);
  await assert.rejects(() => service.createBusinessCapability(context, { ...validInput, effectiveUntil: new Date('invalid') }), /Invalid effective-until date/);
  await assert.rejects(() => service.createBusinessCapability(context, { ...validInput, effectiveUntil: new Date('2026-09-15T00:00:00.000Z') }), /later than effective-from/);
  assert.equal(repository.receivedCreate, null);
});

test('Business Capability reads and lists validate identifiers and preserve context', async () => {
  const repository = new FakeRepository();
  repository.rows.set(1, capability(1, 12));
  repository.rows.set(2, capability(2, 12, '22222222-2222-4222-8222-222222222222'));
  const service = new BusinessCapabilityServiceImpl(repository);

  assert.equal((await service.getBusinessCapability(context, 1))?.id, 1);
  assert.deepEqual((await service.listBusinessCapabilities(context, 12)).map((row) => row.id), [1, 2]);
  assert.equal(repository.receivedContext, context);
  await assert.rejects(() => service.getBusinessCapability(context, 0), /businessCapabilityId must be a positive integer/);
  await assert.rejects(() => service.listBusinessCapabilities(context, 0), /businessId must be a positive integer/);
});

test('Business Capability creation rejects unauthenticated or invalid contexts', async () => {
  const repository = new FakeRepository();
  const service = new BusinessCapabilityServiceImpl(repository);
  await assert.rejects(() => service.createBusinessCapability({ userId: 0, role: 'business' }, validInput), /Invalid authenticated context/);
  await assert.rejects(() => service.createBusinessCapability({ userId: 10, role: 'invalid' as never }, validInput), /Invalid authenticated context/);
  assert.equal(repository.receivedCreate, null);
});
