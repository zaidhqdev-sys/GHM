import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor as es256TokenFor } from './test-resource-auth';
import type { AuthContext } from '../auth/authorization';
import type {
  BusinessCategory,
  BusinessCategoryAssignment,
  BusinessCategoryService,
} from '../resources/business-category/contracts';

const categoryId = '550e8400-e29b-41d4-a716-446655440000';

const startServer = async (service: BusinessCategoryService) => {
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth,
    businessCategoryService: service,
  }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const tokenFor = es256TokenFor;

const category = (): BusinessCategory => ({
  id: categoryId,
  parentId: null,
  name: 'Electrical',
  slug: 'electrical',
  description: null,
  isActive: true,
  sortOrder: 1,
  createdAt: new Date('2026-09-30T00:00:00.000Z'),
  updatedAt: new Date('2026-09-30T00:00:00.000Z'),
});

const assignment = (context: AuthContext): BusinessCategoryAssignment => ({
  id: 101,
  businessId: 55,
  categoryId,
  isPrimary: true,
  createdBy: context.userId,
  createdAt: new Date('2026-09-30T00:00:00.000Z'),
  updatedAt: new Date('2026-09-30T00:00:00.000Z'),
});

test('business category list requires authentication', async () => {
  const service = { listBusinessCategories: async () => { throw new Error('must not be called'); } } as unknown as BusinessCategoryService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-categories`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('business category list is available to an authenticated business context', async () => {
  let receivedContext: AuthContext | undefined;
  const service = {
    listBusinessCategories: async (context: AuthContext) => {
      receivedContext = context;
      return [category()];
    },
  } as unknown as BusinessCategoryService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-categories?activeOnly=true`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    const body = await response.json() as { categories: BusinessCategory[] };
    assert.equal(body.categories[0].slug, 'electrical');
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('business category list rejects malformed activeOnly before service execution', async () => {
  let called = false;
  const service = {
    listBusinessCategories: async () => {
      called = true;
      return [];
    },
  } as unknown as BusinessCategoryService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-categories?activeOnly=yes`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}` },
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('business category get rejects malformed UUID before service execution', async () => {
  let called = false;
  const service = {
    getBusinessCategory: async () => {
      called = true;
      return null;
    },
  } as unknown as BusinessCategoryService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/business-categories/not-a-uuid`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('business category assignments bind authenticated context and businessId', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedBusinessId: number | undefined;
  const service = {
    listBusinessCategoryAssignments: async (context: AuthContext, businessId: number) => {
      receivedContext = context;
      receivedBusinessId = businessId;
      return [assignment(context)];
    },
  } as unknown as BusinessCategoryService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/55/categories`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.equal(receivedBusinessId, 55);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('business category assignment mutation binds canonical route and body input', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedInput: unknown;
  const service = {
    assignBusinessCategory: async (context: AuthContext, input: unknown) => {
      receivedContext = context;
      receivedInput = input;
      return assignment(context);
    },
  } as unknown as BusinessCategoryService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/55/categories`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ categoryId }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.deepEqual(receivedInput, { businessId: 55, categoryId });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('business category primary mutation binds canonical route', async () => {
  let receivedInput: unknown;
  const service = {
    setPrimaryBusinessCategory: async (context: AuthContext, input: unknown) => {
      receivedInput = input;
      return assignment(context);
    },
  } as unknown as BusinessCategoryService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/55/categories/${categoryId}/primary`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedInput, { businessId: 55, categoryId });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('business category mutation maps repository authorization denial to forbidden', async () => {
  const service = {
    assignBusinessCategory: async () => { throw new Error('Business management permission required'); },
  } as unknown as BusinessCategoryService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/55/categories`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ categoryId }),
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'forbidden' });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
