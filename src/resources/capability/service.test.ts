import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type {
  Capability,
  CapabilityRepository,
} from './contracts';
import { CapabilityServiceImpl } from './service';

const context: AuthContext = {
  userId: 7,
  role: 'customer',
};

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
