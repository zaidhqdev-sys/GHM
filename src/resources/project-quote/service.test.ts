import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type {
  CreateProjectQuoteInput,
  ProjectQuote,
  ProjectQuoteDecision,
  ProjectQuoteRepository,
  UpdateProjectQuoteInput,
} from './contracts';
import { ProjectQuoteServiceImpl } from './service';

const context: AuthContext = {
  userId: 10,
  role: 'customer',
};

const quote = (
  status: ProjectQuote['status'] = 'submitted',
): ProjectQuote => ({
  id: 11,
  projectId: 21,
  businessId: 31,
  amount: 15000,
  labourMin: 5000,
  labourMax: 7000,
  materialsMin: 7000,
  materialsMax: 9000,
  totalMin: 12000,
  totalMax: 16000,
  durationDays: 30,
  description: 'A governed Project Quote fixture.',
  status,
  createdAt: new Date(0),
  updatedAt: new Date(0),
});

const createInput: CreateProjectQuoteInput = {
  projectId: 21,
  businessId: 31,
  amount: 15000,
  labourMin: 5000,
  labourMax: 7000,
  materialsMin: 7000,
  materialsMax: 9000,
  totalMin: 12000,
  totalMax: 16000,
  durationDays: 30,
  description: 'A governed Project Quote fixture.',
};

class FakeRepository implements ProjectQuoteRepository {
  lastCreate: unknown = null;
  lastUpdate: unknown = null;
  lastDecision: {
    quoteId: number;
    decision: ProjectQuoteDecision;
  } | null = null;

  async readReceived() {
    return [quote()];
  }

  async readOwn() {
    return [quote()];
  }

  async create(
    _context: AuthContext,
    input: CreateProjectQuoteInput,
  ) {
    this.lastCreate = input;
    return quote();
  }

  async update(
    _context: AuthContext,
    _quoteId: number,
    input: UpdateProjectQuoteInput,
  ) {
    this.lastUpdate = input;
    return quote();
  }

  async decide(
    _context: AuthContext,
    quoteId: number,
    decision: ProjectQuoteDecision,
  ) {
    this.lastDecision = { quoteId, decision };
    return quote(decision);
  }
}

test('Project Quote creation requires an input object', async () => {
  const service = new ProjectQuoteServiceImpl(new FakeRepository());

  await assert.rejects(
    () => service.create(context, null as never),
    /Project Quote input is required/,
  );
});

test('Project Quote service passes creation input to repository', async () => {
  const repository = new FakeRepository();
  const service = new ProjectQuoteServiceImpl(repository);

  await service.create(context, createInput);

  assert.deepEqual(repository.lastCreate, createInput);
});

test('Project Quote service delegates received and own reads', async () => {
  const repository = new FakeRepository();
  const service = new ProjectQuoteServiceImpl(repository);

  const received = await service.readReceived(context, 21);
  const own = await service.readOwn(
    { userId: 31, role: 'business' },
    31,
  );

  assert.equal(received[0]?.projectId, 21);
  assert.equal(own[0]?.businessId, 31);
});

test('Project Quote update requires an input object', async () => {
  const service = new ProjectQuoteServiceImpl(new FakeRepository());

  await assert.rejects(
    () => service.update(context, 11, null as never),
    /Project Quote update input is required/,
  );
});

test('Project Quote service delegates updates', async () => {
  const repository = new FakeRepository();
  const service = new ProjectQuoteServiceImpl(repository);
  const input = { amount: 17500 };

  const result = await service.update(context, 11, input);

  assert.deepEqual(repository.lastUpdate, input);
  assert.equal(result.id, 11);
});

test('accept is an explicit governed decision', async () => {
  const repository = new FakeRepository();
  const service = new ProjectQuoteServiceImpl(repository);

  const result = await service.accept(context, 11);

  assert.deepEqual(repository.lastDecision, {
    quoteId: 11,
    decision: 'accepted',
  });
  assert.equal(result.status, 'accepted');
});

test('reject is an explicit governed decision', async () => {
  const repository = new FakeRepository();
  const service = new ProjectQuoteServiceImpl(repository);

  const result = await service.reject(context, 11);

  assert.deepEqual(repository.lastDecision, {
    quoteId: 11,
    decision: 'rejected',
  });
  assert.equal(result.status, 'rejected');
});
