import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type {
  Capability,
  CapabilityRepository,
  CapabilityDraftInput,
  CapabilityLifecycle,
} from './contracts';
import { CapabilityServiceImpl } from './service';

const context: AuthContext = {
  userId: 7,
  role: 'customer',
};
const adminContext: AuthContext = { userId: 99, role: 'admin' };

const capability = (
  id: string,
  lifecycleStatus: Capability['lifecycleStatus'] = 'active',
  isSelectable = true,
): Capability => ({
  id,
  parentId: null,
  name: 'Construction',
  slug: 'construction',
  description: 'Construction capability fixture.',
  sortOrder: 1,
  lifecycleStatus,
  taxonomyVersion: 1,
  effectiveFrom: new Date(0),
  effectiveTo: null,
  sourceAuthority: 'GHM Test',
  sourceReference: 'capability-service-test',
  replacedByCapabilityId: null,
  isSelectable,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

class FakeRepository implements CapabilityRepository {
  lastGet: {
    context: AuthContext;
    capabilityId: string;
  } | null = null;

  lastListActive: AuthContext | null = null;
  lastListSelectable: AuthContext | null = null;
  lastDraft: CapabilityDraftInput | null = null;
  lastTransition: { capabilityId: string; targetStatus: CapabilityLifecycle; replacement: string | null } | null = null;

  async getCapability(
    receivedContext: AuthContext,
    capabilityId: string,
  ): Promise<Capability> {
    this.lastGet = {
      context: receivedContext,
      capabilityId,
    };

    return capability(capabilityId);
  }

  async listActiveCapabilities(
    receivedContext: AuthContext,
  ): Promise<Capability[]> {
    this.lastListActive = receivedContext;

    return [
      capability('11111111-1111-4111-8111-111111111111'),
      capability(
        '22222222-2222-4222-8222-222222222222',
        'deprecated',
        false,
      ),
    ];
  }

  async listGoverned(_context: AuthContext): Promise<Capability[]> { return [capability('44444444-4444-4444-8444-444444444444', 'draft', false)]; }

  async createDraft(_context: AuthContext, input: CapabilityDraftInput): Promise<Capability> {
    this.lastDraft = input;
    return capability('55555555-5555-4555-8555-555555555555', 'draft', false);
  }

  async updateDraft(_context: AuthContext, capabilityId: string, input: CapabilityDraftInput): Promise<Capability> {
    this.lastDraft = input;
    return capability(capabilityId, 'draft', false);
  }

  async transition(_context: AuthContext, capabilityId: string, targetStatus: CapabilityLifecycle, replacement: string | null = null): Promise<Capability> {
    this.lastTransition = { capabilityId, targetStatus, replacement };
    return capability(capabilityId, targetStatus, targetStatus === 'active');
  }

  async listSelectableCapabilities(
    receivedContext: AuthContext,
  ): Promise<Capability[]> {
    this.lastListSelectable = receivedContext;

    return [
      capability('33333333-3333-4333-8333-333333333333'),
    ];
  }
}

test('Capability service delegates explicit capability reads', async () => {
  const repository = new FakeRepository();
  const service = new CapabilityServiceImpl(repository);
  const capabilityId = '11111111-1111-4111-8111-111111111111';

  const result = await service.getCapability(context, capabilityId);

  assert.equal(result.id, capabilityId);
  assert.equal(result.lifecycleStatus, 'active');
  assert.equal(result.isSelectable, true);
  assert.equal(repository.lastGet?.capabilityId, capabilityId);
  assert.equal(repository.lastGet?.context, context);
});

test('Capability service delegates active catalogue reads', async () => {
  const repository = new FakeRepository();
  const service = new CapabilityServiceImpl(repository);

  const result = await service.listActiveCapabilities(context);

  assert.equal(result.length, 2);
  assert.equal(result[0].lifecycleStatus, 'active');
  assert.equal(result[1].lifecycleStatus, 'deprecated');
  assert.equal(repository.lastListActive, context);
});

test('Capability service delegates selectable catalogue reads', async () => {
  const repository = new FakeRepository();
  const service = new CapabilityServiceImpl(repository);

  const result = await service.listSelectableCapabilities(context);

  assert.equal(result.length, 1);
  assert.equal(result[0].isSelectable, true);
  assert.equal(repository.lastListSelectable, context);
});

test('Capability governance mutations require admin role and normalize draft input', async () => {
  const repository = new FakeRepository();
  const service = new CapabilityServiceImpl(repository);
  assert.throws(() => service.listGoverned(context), /Insufficient role/);
  assert.throws(() => service.createDraft(context, { name: 'Build', slug: 'build' }), /Insufficient role/);
  const result = await service.createDraft(adminContext, {
    name: '  Building  ', slug: 'building', description: '  Built environment  ',
    parentId: null, sortOrder: 5, sourceReference: '  policy-42  ',
  });
  assert.equal(result.lifecycleStatus, 'draft');
  assert.deepEqual(repository.lastDraft, {
    name: 'Building', slug: 'building', description: 'Built environment',
    parentId: null, sortOrder: 5, sourceReference: 'policy-42',
  });
});

test('Capability governance validates draft fields and lifecycle targets', async () => {
  const service = new CapabilityServiceImpl(new FakeRepository());
  assert.throws(() => service.createDraft(adminContext, { name: '', slug: 'bad slug' }), /Capability name/);
  assert.throws(() => service.createDraft(adminContext, { name: 'Build', slug: 'Bad Slug' }), /slug/);
  assert.throws(() => service.createDraft(adminContext, { name: 'Build', slug: 'build', sortOrder: -1 }), /sort order/);
  const id = '55555555-5555-4555-8555-555555555555';
  assert.throws(() => service.updateDraft(adminContext, id, { name: 'Build', slug: 'build', parentId: id }), /parent Capability ID/);
  assert.throws(() => service.transition(adminContext, '55555555-5555-4555-8555-555555555555', 'draft'), /lifecycle target/);
});

test('Capability governance transitions are delegated with replacement context', async () => {
  const repository = new FakeRepository();
  const service = new CapabilityServiceImpl(repository);
  const id = '55555555-5555-4555-8555-555555555555';
  const replacement = '66666666-6666-4666-8666-666666666666';
  const result = await service.transition(adminContext, id, 'retired', replacement);
  assert.equal(result.lifecycleStatus, 'retired');
  assert.deepEqual(repository.lastTransition, { capabilityId: id, targetStatus: 'retired', replacement });
});
