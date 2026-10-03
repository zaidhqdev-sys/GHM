import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { Project, ProjectService } from '../../resources/project/contracts';
import type { ConnectAuthorizedOperation } from './authorization-binding';
import { ConnectProjectAdapterError, dispatchConnectProjectCapability } from './project-adapter';

const customerContext: AuthContext = { userId: 42, role: 'customer' };
const businessContext: AuthContext = { userId: 84, role: 'business' };

const project = (id = 7): Project => ({
  id,
  accountId: 42,
  title: 'Website Project',
  description: 'Build a complete business website',
  category: 'web',
  province: 'KwaZulu-Natal',
  city: 'Durban',
  budgetMin: 1000,
  budgetMax: 2000,
  urgency: 'standard',
  status: 'open',
  createdAt: new Date(),
  updatedAt: new Date(),
});

const authorized = (
  context: AuthContext,
  capability: ConnectAuthorizedOperation['capability'],
  operation: ConnectAuthorizedOperation['operation'],
): ConnectAuthorizedOperation => ({ capability, resource: 'project', operation, context });

const service = (calls: string[]): ProjectService => ({
  createProject: async (_context, input) => { calls.push(`create:${input.title}`); return project(8); },
  getOwnedProject: async (_context, id) => { calls.push(`read:${id}`); return project(id); },
  updateOwnedProject: async (_context, id, input) => { calls.push(`update:${id}:${input.title ?? ''}`); return project(id); },
});

const createInput = {
  title: 'Website Project',
  description: 'Build a complete business website',
  category: 'web',
  province: 'KwaZulu-Natal',
  city: 'Durban',
};

test('customer project read delegates to owned project service', async () => {
  const calls: string[] = [];
  await dispatchConnectProjectCapability(
    authorized(customerContext, 'project.read', 'read'),
    { capability: 'project.read', projectId: 7 },
    { projects: service(calls) },
  );
  assert.deepEqual(calls, ['read:7']);
});

test('customer project create delegates canonical input', async () => {
  const calls: string[] = [];
  await dispatchConnectProjectCapability(
    authorized(customerContext, 'project.create', 'create'),
    { capability: 'project.create', input: createInput },
    { projects: service(calls) },
  );
  assert.deepEqual(calls, ['create:Website Project']);
});

test('customer project update delegates owned update', async () => {
  const calls: string[] = [];
  await dispatchConnectProjectCapability(
    authorized(customerContext, 'project.update', 'update'),
    { capability: 'project.update', projectId: 7, input: { title: 'Updated Project' } },
    { projects: service(calls) },
  );
  assert.deepEqual(calls, ['update:7:Updated Project']);
});

test('business project create fails before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectProjectCapability(
      authorized(businessContext, 'project.create', 'create'),
      { capability: 'project.create', input: createInput },
      { projects: service(calls) },
    ),
    ConnectProjectAdapterError,
  );
  assert.deepEqual(calls, []);
});

test('business project update fails before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectProjectCapability(
      authorized(businessContext, 'project.update', 'update'),
      { capability: 'project.update', projectId: 7, input: { title: 'Updated Project' } },
      { projects: service(calls) },
    ),
    ConnectProjectAdapterError,
  );
  assert.deepEqual(calls, []);
});

test('invalid project identifier fails before service access', async () => {
  const calls: string[] = [];
  await assert.rejects(
    () => dispatchConnectProjectCapability(
      authorized(customerContext, 'project.read', 'read'),
      { capability: 'project.read', projectId: 0 },
      { projects: service(calls) },
    ),
    /Invalid project identifier/,
  );
  assert.deepEqual(calls, []);
});
