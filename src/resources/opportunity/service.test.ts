import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type {
  Opportunity,
  OpportunityRepository,
} from './contracts';
import { OpportunityServiceImpl } from './service';

const context: AuthContext = {
  userId: 7,
  role: 'business',
};

const opportunity = (): Opportunity => ({
  id: 11,
  opportunityTypeId: 1,
  creatorAccountId: 7,
  ownerBusinessId: null,
  countryId: null,
  currencyId: null,
  title: 'Service request',
  description: 'A governed opportunity fixture.',
  lifecycleStatus: 'draft',
  visibility: 'private',
  budgetMin: null,
  budgetMax: null,
  opensAt: null,
  closesAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

class FakeRepository implements OpportunityRepository {
  lastCreate: unknown = null;
  lastUpdate: unknown = null;
  lastTransition: unknown = null;

  async createOpportunity(_context: AuthContext, input: any) {
    this.lastCreate = input;
    return opportunity();
  }

  async getOpportunity() {
    return opportunity();
  }

  async getOwnedOpportunity() {
    return opportunity();
  }

  async updateOwnedOpportunity(_context: AuthContext, _id: number, input: any) {
    this.lastUpdate = input;
    return opportunity();
  }

  async transitionOpportunity(
    _context: AuthContext,
    _id: number,
    nextStatus: any,
  ) {
    this.lastTransition = nextStatus;
    return {
      ...opportunity(),
      lifecycleStatus: nextStatus,
    };
  }
}

test('Opportunity creation requires an input object', async () => {
  const service = new OpportunityServiceImpl(new FakeRepository());

  await assert.rejects(
    () => service.createOpportunity(context, null as never),
    /Opportunity input is required/,
  );
});

test('Opportunity service passes creation input through unchanged to repository', async () => {
  const repository = new FakeRepository();
  const service = new OpportunityServiceImpl(repository);
  const input = {
    opportunityTypeId: 1,
    title: 'Service request',
    description: 'A governed opportunity fixture.',
    visibility: 'private' as const,
  };

  await service.createOpportunity(context, input);

  assert.deepEqual(repository.lastCreate, input);
});

test('Opportunity service delegates owned reads and updates', async () => {
  const repository = new FakeRepository();
  const service = new OpportunityServiceImpl(repository);

  const owned = await service.getOwnedOpportunity(context, 11);
  const updated = await service.updateOwnedOpportunity(context, 11, {
    title: 'Updated opportunity',
  });

  assert.equal(owned?.id, 11);
  assert.equal(updated.id, 11);
  assert.deepEqual(repository.lastUpdate, { title: 'Updated opportunity' });
});

test('Opportunity service delegates explicit lifecycle transitions', async () => {
  const repository = new FakeRepository();
  const service = new OpportunityServiceImpl(repository);

  const result = await service.transitionOpportunity(context, 11, 'open');

  assert.equal(repository.lastTransition, 'open');
  assert.equal(result.lifecycleStatus, 'open');
});
