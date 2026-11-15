import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor } from './test-resource-auth';
import { AuthContext } from '../auth/authorization';
import { Project, ProjectService } from '../resources/project/contracts';
import { Opportunity, OpportunityService } from '../resources/opportunity/contracts';
import { PublicProject, PublicProjectService } from '../resources/project/public-contracts';
import { AccountIdentity, BusinessIdentity, BusinessIdentityService } from '../resources/business-identity/contracts';
import { PublicBusiness, PublicBusinessService } from '../resources/business-identity/public-contracts';
import { DirectoryResult, DirectoryService } from '../resources/directory/contracts';
import type { BusinessCategoryService } from '../resources/business-category/contracts';
import type { SupplierClassificationGatewayClient } from './supplier-classification-gateway-client';
import type { BusinessProfileGatewayClient } from './business-profile-gateway-client';
import type { BusinessHoursService } from '../resources/business-hours/contracts';
import type { BusinessCapabilityService } from '../resources/business-capability/contracts';


const startOpportunityTestServer = async (opportunityService: OpportunityService) => {
  const businessService = {} as BusinessIdentityService;
  const server = http.createServer(createApp({
    resourceAuthMiddleware: httpTestAuth,
    businessIdentityService: businessService,
    opportunityService,
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const opportunityFixture = (overrides: Partial<Opportunity> = {}): Opportunity => ({
  id: 301,
  opportunityTypeId: 4,
  creatorAccountId: 55,
  ownerBusinessId: 72,
  countryId: 1,
  currencyId: 1,
  title: 'Residential roof repair',
  description: 'Repair and waterproof a residential roof.',
  lifecycleStatus: 'draft',
  visibility: 'private',
  budgetMin: 10000,
  budgetMax: 25000,
  opensAt: new Date('2026-11-10T00:00:00.000Z'),
  closesAt: new Date('2026-12-10T00:00:00.000Z'),
  createdAt: new Date('2026-11-06T00:00:00.000Z'),
  updatedAt: new Date('2026-11-06T00:00:00.000Z'),
  ...overrides,
});

const profile = (context: AuthContext): AccountIdentity => ({
  id: context.userId,
  fullName: 'HTTP Qualification User',
  phone: null,
  avatarRef: null,
  role: context.role,
  createdAt: new Date('2026-09-10T00:00:00.000Z'),
  updatedAt: new Date('2026-09-10T00:00:00.000Z'),
});

const startTestServer = async (service: BusinessIdentityService, supplierClassificationGatewayClient?: SupplierClassificationGatewayClient, businessProfileGatewayClient?: BusinessProfileGatewayClient) => {
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth, businessIdentityService: service, supplierClassificationGatewayClient, businessProfileGatewayClient }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const publicBusinessFixture = (overrides: Partial<PublicBusiness> = {}): PublicBusiness => ({
  id: 201,
  name: 'Public Business',
  slug: 'public-business',
  description: 'Public description',
  phone: '0111234567',
  email: 'business@example.com',
  rating: 4.5,
  reviewCount: 12,
  jobsCompleted: 8,
  verificationStatus: 'approved',
  isVerified: true,
  createdAt: new Date('2026-09-10T00:00:00.000Z'),
  updatedAt: new Date('2026-09-10T00:00:00.000Z'),
  ...overrides,
});

const startPublicBusinessTestServer = async (publicBusinessService: PublicBusinessService) => {
  const businessService = {} as BusinessIdentityService;
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth, businessIdentityService: businessService, publicBusinessService }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const startDirectoryTestServer = async (directoryService: DirectoryService) => {
  const businessService = {} as BusinessIdentityService;
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth, businessIdentityService: businessService, directoryService }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};



test('public directory route allows anonymous access and returns the directory result', async () => {
  const result: DirectoryResult = {
    items: [publicBusinessFixture({ id: 301 })],
    page: 1,
    pageSize: 20,
    total: 1,
  };
  let received: unknown;
  const directoryService: DirectoryService = {
    search: async query => {
      received = query;
      return result;
    },
  };
  const { server, baseUrl } = await startDirectoryTestServer(directoryService);
  try {
    const response = await fetch(`${baseUrl}/api/v1/public/businesses?q=build&category=construction&page=1&pageSize=20`);
    assert.equal(response.status, 200);
    assert.deepEqual(received, { q: 'build', category: 'construction', province: undefined, city: undefined, latitude: undefined, longitude: undefined, radiusKm: undefined, sort: undefined, page: 1, pageSize: 20 });
    const body = await response.json() as DirectoryResult & { items: Array<PublicBusiness & { createdAt: string; updatedAt: string }> };
    assert.equal(body.items[0].id, 301);
    assert.equal(body.page, 1);
    assert.equal(body.pageSize, 20);
    assert.equal(body.total, 1);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('public directory route applies pagination defaults and ignores authentication', async () => {
  let received: unknown;
  const directoryService: DirectoryService = {
    search: async query => {
      received = query;
      return { items: [], page: query.page, pageSize: query.pageSize, total: 0 };
    },
  };
  const { server, baseUrl } = await startDirectoryTestServer(directoryService);
  try {
    const response = await fetch(`${baseUrl}/api/v1/public/businesses`, {
      headers: { authorization: 'Bearer invalid-token' },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, { q: undefined, category: undefined, province: undefined, city: undefined, latitude: undefined, longitude: undefined, radiusKm: undefined, sort: undefined, page: 1, pageSize: 20 });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('public directory route rejects unsupported and malformed query parameters before service execution', async () => {
  let called = false;
  const directoryService: DirectoryService = {
    search: async () => {
      called = true;
      throw new Error('must not be called');
    },
  };
  const { server, baseUrl } = await startDirectoryTestServer(directoryService);
  try {
    const unsupported = await fetch(`${baseUrl}/api/v1/public/businesses?tier=gold`);
    assert.equal(unsupported.status, 400);

    const malformed = await fetch(`${baseUrl}/api/v1/public/businesses?page=0`);
    assert.equal(malformed.status, 400);

    const oversized = await fetch(`${baseUrl}/api/v1/public/businesses?pageSize=51`);
    assert.equal(oversized.status, 400);

    assert.equal(called, false);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('public Business route allows anonymous access and returns only the public projection', async () => {
  const business = publicBusinessFixture();
  const publicBusinessService: PublicBusinessService = {
    getPublicBusiness: async (businessId) => { assert.equal(businessId, business.id); return business; },
    getPublicBusinessBySlug: async (slug) => { assert.equal(slug, business.slug); return business; },
  };
  const { server, baseUrl } = await startPublicBusinessTestServer(publicBusinessService);
  try {
    const response = await fetch(`${baseUrl}/api/v1/public/businesses/${business.id}`);
    assert.equal(response.status, 200);
    const body = await response.json() as { business: PublicBusiness & { createdAt: string; updatedAt: string } };
    assert.deepEqual(body.business, {
      ...business,
      createdAt: business.createdAt.toISOString(),
      updatedAt: business.updatedAt.toISOString(),
    });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('public Business route does not require or trust invalid authentication', async () => {
  const business = publicBusinessFixture({ id: 202 });
  let called = false;
  const publicBusinessService: PublicBusinessService = {
    getPublicBusiness: async () => { called = true; return business; },
    getPublicBusinessBySlug: async () => null,
  };
  const { server, baseUrl } = await startPublicBusinessTestServer(publicBusinessService);
  try {
    const response = await fetch(`${baseUrl}/api/v1/public/businesses/${business.id}`, { headers: { authorization: 'Bearer invalid-token' } });
    assert.equal(response.status, 200);
    assert.equal(called, true);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('public Business routes reject invalid identifiers before service execution', async () => {
  let called = false;
  const publicBusinessService: PublicBusinessService = {
    getPublicBusiness: async () => { called = true; throw new Error('must not be called'); },
    getPublicBusinessBySlug: async () => { called = true; throw new Error('must not be called'); },
  };
  const { server, baseUrl } = await startPublicBusinessTestServer(publicBusinessService);
  try {
    const idResponse = await fetch(`${baseUrl}/api/v1/public/businesses/not-an-id`);
    assert.equal(idResponse.status, 400);
    const slugResponse = await fetch(`${baseUrl}/api/v1/public/businesses/slug/   `);
    assert.equal(slugResponse.status, 400);
    assert.equal(called, false);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('public Business slug route resolves through the public projection', async () => {
  const business = publicBusinessFixture();
  const publicBusinessService: PublicBusinessService = {
    getPublicBusiness: async () => null,
    getPublicBusinessBySlug: async (slug) => { assert.equal(slug, business.slug); return business; },
  };
  const { server, baseUrl } = await startPublicBusinessTestServer(publicBusinessService);
  try {
    const response = await fetch(`${baseUrl}/api/v1/public/businesses/slug/${business.slug}`);
    assert.equal(response.status, 200);
    const body = await response.json() as { business: PublicBusiness & { createdAt: string; updatedAt: string } };
    assert.equal(body.business.id, business.id);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('protected profile route rejects missing authentication', async () => {
  const service = { getOwnProfile: async () => { throw new Error('must not be called'); } } as unknown as BusinessIdentityService;
  const { server, baseUrl } = await startTestServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/profile`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('protected profile route authenticates and binds the JWT context to the service call', async () => {
  let receivedContext: AuthContext | undefined;
  const service = {
    getOwnProfile: async (context: AuthContext) => {
      receivedContext = context;
      return profile(context);
    },
  } as unknown as BusinessIdentityService;
  const { server, baseUrl } = await startTestServer(service);
  try {
    const token = tokenFor({ userId: 42, role: 'business' });
    const response = await fetch(`${baseUrl}/api/v1/profile`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    const body = await response.json() as { profile: AccountIdentity };
    assert.equal(body.profile.id, 42);
    assert.equal(body.profile.role, 'business');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('protected profile route rejects an invalid JWT', async () => {
  const service = { getOwnProfile: async () => { throw new Error('must not be called'); } } as unknown as BusinessIdentityService;
  const { server, baseUrl } = await startTestServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/profile`, {
      headers: { authorization: 'Bearer not-a-valid-token' },
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});


const startProjectTestServer = async (
  projectService: ProjectService,
  publicProjectService: PublicProjectService = {
    listPublicProjects: async input => ({ projects: [], total: 0, limit: input.limit, offset: input.offset }),
    getPublicProject: async () => {
      throw new Error('public Project service must not be called');
    },
  },
) => {
  const businessService = {} as BusinessIdentityService;
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth,
    businessIdentityService: businessService,
    projectService,
    publicProjectService,
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const projectFixture = (context: AuthContext, overrides: Partial<Project> = {}): Project => ({
  id: 101,
  accountId: context.userId,
  title: 'Kitchen renovation',
  description: 'Renovation project for a residential kitchen and related finishes.',
  category: 'construction',
  province: 'KwaZulu-Natal',
  city: 'Durban',
  budgetMin: 50000,
  budgetMax: 100000,
  urgency: 'standard',
  status: 'open',
  createdAt: new Date('2026-09-10T00:00:00.000Z'),
  updatedAt: new Date('2026-09-10T00:00:00.000Z'),
  ...overrides,
});

const publicProjectFixture = (
  overrides: Partial<PublicProject> = {},
): PublicProject => ({
  id: 101,
  title: 'Kitchen renovation',
  description: 'Renovation project for a residential kitchen and related finishes.',
  category: 'construction',
  province: 'KwaZulu-Natal',
  city: 'Durban',
  budgetMin: 50000,
  budgetMax: 100000,
  urgency: 'standard',
  status: 'open',
  createdAt: new Date('2026-09-10T00:00:00.000Z'),
  updatedAt: new Date('2026-09-10T00:00:00.000Z'),
  ...overrides,
});


test('public project route allows anonymous access through the public operation', async () => {
  const project = publicProjectFixture();
  const publicProjectService: PublicProjectService = {
    listPublicProjects: async input => ({ projects: [], total: 0, limit: input.limit, offset: input.offset }),
    getPublicProject: async (projectId) => {
      assert.equal(projectId, project.id);
      return project;
    },
  };

  const projectService = {} as ProjectService;
  const { server, baseUrl } = await startProjectTestServer(
    projectService,
    publicProjectService,
  );

  try {
    const response = await fetch(
      `${baseUrl}/api/v1/public/projects/${project.id}`,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
  project: {
    ...project,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  },
});
  } finally {
    server.close();
  }
});

test('public project route allows authenticated non-owner disclosure without private authorization', async () => {
  const project = publicProjectFixture({ id: 102 });
  const publicProjectService: PublicProjectService = {
    listPublicProjects: async input => ({ projects: [], total: 0, limit: input.limit, offset: input.offset }),
    getPublicProject: async (projectId) => {
      assert.equal(projectId, project.id);
      return project;
    },
  };

  const projectService = {} as ProjectService;
  const { server, baseUrl } = await startProjectTestServer(
    projectService,
    publicProjectService,
  );

  try {
    const token = tokenFor({ userId: 999, role: 'business' });

    const response = await fetch(
      `${baseUrl}/api/v1/public/projects/${project.id}`,
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
  project: {
    ...project,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  },
});
  } finally {
    server.close();
  }
});

test('public project route ignores invalid authentication', async () => {
  const project = publicProjectFixture({ id: 103 });
  const publicProjectService: PublicProjectService = {
    listPublicProjects: async input => ({ projects: [], total: 0, limit: input.limit, offset: input.offset }),
    getPublicProject: async (projectId) => {
      assert.equal(projectId, project.id);
      return project;
    },
  };

  const projectService = {} as ProjectService;
  const { server, baseUrl } = await startProjectTestServer(
    projectService,
    publicProjectService,
  );

  try {
    const response = await fetch(
      `${baseUrl}/api/v1/public/projects/${project.id}`,
      {
        headers: {
          authorization: 'Bearer definitely-invalid-token',
        },
      },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
  project: {
    ...project,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  },
});
  } finally {
    server.close();
  }
});

test('public project route rejects invalid ids before service execution', async () => {
  let called = false;

  const publicProjectService: PublicProjectService = {
    listPublicProjects: async input => ({ projects: [], total: 0, limit: input.limit, offset: input.offset }),
    getPublicProject: async () => {
      called = true;
      throw new Error('must not be called');
    },
  };

  const projectService = {} as ProjectService;
  const { server, baseUrl } = await startProjectTestServer(
    projectService,
    publicProjectService,
  );

  try {
    const response = await fetch(
      `${baseUrl}/api/v1/public/projects/not-an-id`,
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: 'invalid_request',
    });
    assert.equal(called, false);
  } finally {
    server.close();
  }
});

test('public project route returns not found when projection has no eligible project', async () => {
  const publicProjectService: PublicProjectService = {
    listPublicProjects: async input => ({ projects: [], total: 0, limit: input.limit, offset: input.offset }),
    getPublicProject: async (projectId) => {
      assert.equal(projectId, 104);
      return null;
    },
  };

  const projectService = {} as ProjectService;
  const { server, baseUrl } = await startProjectTestServer(
    projectService,
    publicProjectService,
  );

  try {
    const response = await fetch(
      `${baseUrl}/api/v1/public/projects/104`,
    );

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: 'not_found',
    });
  } finally {
    server.close();
  }
});

test('public project route does not expose a mutation surface', async () => {
  let called = false;

  const publicProjectService: PublicProjectService = {
    listPublicProjects: async input => ({ projects: [], total: 0, limit: input.limit, offset: input.offset }),
    getPublicProject: async () => {
      called = true;
      throw new Error('must not be called');
    },
  };

  const projectService = {} as ProjectService;
  const { server, baseUrl } = await startProjectTestServer(
    projectService,
    publicProjectService,
  );

  try {
    const response = await fetch(
      `${baseUrl}/api/v1/public/projects/101`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          title: 'Attempted public mutation',
        }),
      },
    );

    assert.equal(response.status, 404);
    assert.equal(called, false);
  } finally {
    server.close();
  }
});
test('project create route requires authentication', async () => {
  const projectService = {
    createProject: async () => { throw new Error('must not be called'); },
  } as unknown as ProjectService;

  const { server, baseUrl } = await startProjectTestServer(projectService);

  try {
    const response = await fetch(`${baseUrl}/api/v1/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Kitchen renovation',
        description: 'Renovation project for a residential kitchen and related finishes.',
        category: 'construction',
        province: 'KwaZulu-Natal',
        city: 'Durban',
      }),
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('project create route rejects server-owned fields before service execution', async () => {
  let called = false;

  const projectService = {
    createProject: async () => {
      called = true;
      throw new Error('must not be called');
    },
  } as unknown as ProjectService;

  const { server, baseUrl } = await startProjectTestServer(projectService);

  try {
    const token = tokenFor({ userId: 42, role: 'business' });

    const response = await fetch(`${baseUrl}/api/v1/projects`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Kitchen renovation',
        description: 'Renovation project for a residential kitchen and related finishes.',
        category: 'construction',
        province: 'KwaZulu-Natal',
        city: 'Durban',
        accountId: 999,
        status: 'completed',
      }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
    assert.equal(called, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('project create route binds authenticated context and returns the created project', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedInput: unknown;

  const projectService = {
    createProject: async (context: AuthContext, input: unknown) => {
      receivedContext = context;
      receivedInput = input;
      return projectFixture(context);
    },
  } as unknown as ProjectService;

  const { server, baseUrl } = await startProjectTestServer(projectService);

  try {
    const token = tokenFor({ userId: 42, role: 'business' });

    const response = await fetch(`${baseUrl}/api/v1/projects`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Kitchen renovation',
        description: 'Renovation project for a residential kitchen and related finishes.',
        category: 'construction',
        province: 'KwaZulu-Natal',
        city: 'Durban',
        budgetMin: 50000,
        budgetMax: 100000,
        urgency: 'urgent',
      }),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.deepEqual(receivedInput, {
      title: 'Kitchen renovation',
      description: 'Renovation project for a residential kitchen and related finishes.',
      category: 'construction',
      province: 'KwaZulu-Natal',
      city: 'Durban',
      budgetMin: 50000,
      budgetMax: 100000,
      urgency: 'urgent',
    });

    const body = await response.json() as { project: Project };
    assert.equal(body.project.id, 101);
    assert.equal(body.project.accountId, 42);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('project owner read route returns the owned project', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedProjectId: number | undefined;

  const projectService = {
    getOwnedProject: async (context: AuthContext, projectId: number) => {
      receivedContext = context;
      receivedProjectId = projectId;
      return projectFixture(context);
    },
  } as unknown as ProjectService;

  const { server, baseUrl } = await startProjectTestServer(projectService);

  try {
    const token = tokenFor({ userId: 42, role: 'customer' });

    const response = await fetch(`${baseUrl}/api/v1/projects/101`, {
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'customer' });
    assert.equal(receivedProjectId, 101);

    const body = await response.json() as { project: Project };
    assert.equal(body.project.accountId, 42);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('project non-owner read route returns not found', async () => {
  const projectService = {
    getOwnedProject: async () => null,
  } as unknown as ProjectService;

  const { server, baseUrl } = await startProjectTestServer(projectService);

  try {
    const token = tokenFor({ userId: 99, role: 'business' });

    const response = await fetch(`${baseUrl}/api/v1/projects/101`, {
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('project routes reject invalid ids', async () => {
  const projectService = {
    getOwnedProject: async () => { throw new Error('must not be called'); },
    updateOwnedProject: async () => { throw new Error('must not be called'); },
  } as unknown as ProjectService;

  const { server, baseUrl } = await startProjectTestServer(projectService);

  try {
    const token = tokenFor({ userId: 42, role: 'business' });

    const getResponse = await fetch(`${baseUrl}/api/v1/projects/not-an-id`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(getResponse.status, 400);
    assert.deepEqual(await getResponse.json(), { error: 'invalid_request' });

    const patchResponse = await fetch(`${baseUrl}/api/v1/projects/0`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'Updated project title' }),
    });
    assert.equal(patchResponse.status, 400);
    assert.deepEqual(await patchResponse.json(), { error: 'invalid_request' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('project update route returns updated owner project', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedProjectId: number | undefined;
  let receivedInput: unknown;

  const projectService = {
    updateOwnedProject: async (
      context: AuthContext,
      projectId: number,
      input: unknown,
    ) => {
      receivedContext = context;
      receivedProjectId = projectId;
      receivedInput = input;
      return projectFixture(context, { title: 'Updated kitchen renovation' });
    },
  } as unknown as ProjectService;

  const { server, baseUrl } = await startProjectTestServer(projectService);

  try {
    const token = tokenFor({ userId: 42, role: 'business' });

    const response = await fetch(`${baseUrl}/api/v1/projects/101`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        title: 'Updated kitchen renovation',
        urgency: 'urgent',
      }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.equal(receivedProjectId, 101);
    assert.deepEqual(receivedInput, {
      title: 'Updated kitchen renovation',
      urgency: 'urgent',
    });

    const body = await response.json() as { project: Project };
    assert.equal(body.project.title, 'Updated kitchen renovation');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('project update route rejects status and account ownership mutation', async () => {
  let called = false;

  const projectService = {
    updateOwnedProject: async () => {
      called = true;
      throw new Error('must not be called');
    },
  } as unknown as ProjectService;

  const { server, baseUrl } = await startProjectTestServer(projectService);

  try {
    const token = tokenFor({ userId: 42, role: 'business' });

    const response = await fetch(`${baseUrl}/api/v1/projects/101`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        status: 'completed',
        accountId: 999,
      }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
    assert.equal(called, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('project update route maps closed-project denial to conflict', async () => {
  const projectService = {
    updateOwnedProject: async () => {
      throw new Error('Only open Projects may be updated');
    },
  } as unknown as ProjectService;

  const { server, baseUrl } = await startProjectTestServer(projectService);

  try {
    const token = tokenFor({ userId: 42, role: 'business' });

    const response = await fetch(`${baseUrl}/api/v1/projects/101`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'Updated kitchen renovation' }),
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: 'conflict' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('lazy auth service uses the app-injected auth persistence for reset session issuance', async (t) => {
  const authModule = require('../auth/ghm-auth-service') as typeof import('../auth/ghm-auth-service');
  const authPersistence = {} as never;
  let receivedPersistence: unknown;
  let loginCalled = false;
  t.mock.method(authModule, 'createGhmAuthService', (persistence: import('../auth/foundation/persistence').AuthPersistence) => {
    receivedPersistence = persistence;
    return {
      login: async () => {
        loginCalled = true;
        return {
          accessToken: 'access.jwt',
          refreshToken: 'refresh-wire',
          tokenType: 'Bearer' as const,
          expiresIn: 900,
          sessionId: 99,
          accountId: 42,
        };
      },
      refresh: async () => { throw new Error('unused'); },
      logout: async () => undefined,
    };
  });
  const server = http.createServer(createApp({
    authPersistence,
    businessIdentityService: {} as never,
    quoteFlowMigrationResetCompletionService: {
      complete: async () => ({ accountId: 42, loginEmail: 'legacy@example.com' }),
    },
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/quoteflow-migration-reset/complete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'opaque-token', password: 'CorrectHorseBattery1' }),
    });
    assert.equal(response.status, 200);
    assert.equal(receivedPersistence, authPersistence);
    assert.equal(loginCalled, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});


test('public directory route passes canonical location and geo filters without authentication', async () => {
  let received: unknown;
  const directoryService: DirectoryService = {
    search: async query => { received = query; return { items: [], page: query.page, pageSize: query.pageSize, total: 0 }; },
  };
  const { server, baseUrl } = await startDirectoryTestServer(directoryService);
  try {
    const response = await fetch(`${baseUrl}/api/v1/public/businesses?province=KwaZulu-Natal&city=Durban&latitude=-29.85&longitude=31.02&radiusKm=25&sort=distance`);
    assert.equal(response.status, 200);
    assert.deepEqual(received, { q: undefined, category: undefined, province: 'KwaZulu-Natal', city: 'Durban', latitude: -29.85, longitude: 31.02, radiusKm: 25, sort: 'distance', page: 1, pageSize: 20 });
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});


test('public business category discovery allows anonymous access and returns only the active taxonomy', async () => {
  let called = false;
  const categories = [{ id: '550e8400-e29b-41d4-a716-446655440000', parentId: null, name: 'Electrical', slug: 'electrical', description: null, isActive: true, sortOrder: 1, createdAt: new Date('2026-09-30T00:00:00.000Z'), updatedAt: new Date('2026-09-30T00:00:00.000Z') }];
  const businessCategoryService = {
    listPublicBusinessCategories: async () => { called = true; return categories; },
  } as unknown as BusinessCategoryService;
  const server = http.createServer(createApp({ businessCategoryService }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(`${baseUrl}/api/v1/public/business-categories`, { headers: { authorization: 'Bearer invalid-token' } });
    assert.equal(response.status, 200);
    assert.equal(called, true);
    const body = await response.json() as { categories: Array<{ slug: string }> };
    assert.equal(body.categories[0].slug, 'electrical');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});


test('public business profile auxiliary endpoints expose only GHM public resources without authentication', async () => {
  const businessHoursService = {
    listPublicBusinessHours: async (businessId: number) => {
      assert.equal(businessId, 77);
      return [{ id: 1, businessId, dayOfWeek: 1, isClosed: false, openTime: '08:00', closeTime: '17:00', createdBy: null, createdAt: new Date('2026-10-01T00:00:00.000Z'), updatedAt: new Date('2026-10-01T00:00:00.000Z') }];
    },
  } as unknown as BusinessHoursService;
  const businessCapabilityService = {
    listPublicBusinessCapabilities: async (businessId: number) => {
      assert.equal(businessId, 77);
      return [{ id: 5, capabilityId: '550e8400-e29b-41d4-a716-446655440000', name: 'Electrical', slug: 'electrical', proficiencyLevel: 'advanced', description: null, effectiveFrom: new Date('2026-10-01T00:00:00.000Z'), effectiveUntil: null }];
    },
  } as unknown as BusinessCapabilityService;
  const server = http.createServer(createApp({ businessHoursService, businessCapabilityService }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    const hours = await fetch(`${baseUrl}/api/v1/public/businesses/77/hours`);
    assert.equal(hours.status, 200);
    const hoursBody = await hours.json() as { hours: Array<{ dayOfWeek: number }> };
    assert.equal(hoursBody.hours[0].dayOfWeek, 1);

    const capabilities = await fetch(`${baseUrl}/api/v1/public/businesses/77/capabilities`);
    assert.equal(capabilities.status, 200);
    const capabilityBody = await capabilities.json() as { capabilities: Array<{ slug: string }> };
    assert.equal(capabilityBody.capabilities[0].slug, 'electrical');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});



test('authenticated business membership API lists only the caller\'s contexts and returns selected membership', async () => {
  const membership = {
    id: 91,
    businessId: 201,
    accountId: 42,
    role: 'member',
    status: 'active',
    createdBy: 42,
    createdAt: new Date('2026-09-10T00:00:00.000Z'),
    updatedAt: new Date('2026-09-10T00:00:00.000Z'),
  };
  const business = {
    id: 201,
    name: 'Member Business',
    slug: 'member-business',
    description: null,
    phone: null,
    email: null,
    insuranceVerified: false,
    jobsCompleted: 0,
    verificationStatus: 'approved',
    isActive: true,
    createdAt: new Date('2026-09-10T00:00:00.000Z'),
    updatedAt: new Date('2026-09-10T00:00:00.000Z'),
  };
  const service = {
    listManagedBusinesses: async (context: AuthContext) => {
      assert.equal(context.userId, 42);
      return [{ membership, business }];
    },
  } as unknown as BusinessIdentityService;
  const { server, baseUrl } = await startTestServer(service);
  const token = tokenFor({ userId: 42, role: 'business' });
  try {
    const listResponse = await fetch(`${baseUrl}/api/v1/businesses/memberships`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(listResponse.status, 200);
    const listBody = await listResponse.json() as { memberships: Array<{ membership: { role: string }; business: { id: number } }> };
    assert.equal(listBody.memberships.length, 1);
    assert.equal(listBody.memberships[0].business.id, 201);
    assert.equal(listBody.memberships[0].membership.role, 'member');

    const selectedResponse = await fetch(`${baseUrl}/api/v1/businesses/201/managed`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(selectedResponse.status, 200);
    const selectedBody = await selectedResponse.json() as { business: { id: number }; membership: { role: string } };
    assert.equal(selectedBody.business.id, 201);
    assert.equal(selectedBody.membership.role, 'member');

    const deniedResponse = await fetch(`${baseUrl}/api/v1/businesses/202/managed`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(deniedResponse.status, 404);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Opportunity creation route passes authenticated context and validated input to service', async () => {
  const expected = opportunityFixture();
  const service: OpportunityService = {
    createOpportunity: async (context, input) => {
      assert.equal(context.userId, 55);
      assert.equal(context.role, 'customer');
      assert.equal(input.opportunityTypeId, 4);
      assert.equal(input.ownerBusinessId, 72);
      assert.ok(input.opensAt instanceof Date);
      return expected;
    },
    getOpportunity: async () => null,
    getOwnedOpportunity: async () => null,
    updateOwnedOpportunity: async () => { throw new Error('not expected'); },
    transitionOpportunity: async () => { throw new Error('not expected'); },
    listMarketplaceOpportunities: async () => ({ opportunities: [], total: 0, limit: 50, offset: 0 }),
    listOpportunityTypes: async () => [],
  };
  const { server, baseUrl } = await startOpportunityTestServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/opportunities`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 55, role: 'customer' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        opportunityTypeId: 4, ownerBusinessId: 72, countryId: 1, currencyId: 1,
        title: 'Residential roof repair', description: 'Repair and waterproof a residential roof.',
        visibility: 'private', budgetMin: 10000, budgetMax: 25000,
        opensAt: '2026-11-10T00:00:00.000Z', closesAt: '2026-12-10T00:00:00.000Z',
      }),
    });
    assert.equal(response.status, 201);
    const body = await response.json() as { opportunity: { id: number; lifecycleStatus: string } };
    assert.equal(body.opportunity.id, expected.id);
    assert.equal(body.opportunity.lifecycleStatus, 'draft');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Opportunity creation route rejects malformed input before service invocation', async () => {
  let called = false;
  const service = {
    createOpportunity: async () => { called = true; throw new Error('must not be called'); },
  } as unknown as OpportunityService;
  const { server, baseUrl } = await startOpportunityTestServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/opportunities`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 55, role: 'customer' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ opportunityTypeId: 0, title: '', description: 'x', unexpected: true }),
    });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
    assert.equal(called, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});


test('Opportunity transition route passes the authenticated account and requested lifecycle status', async () => {
  const expected = opportunityFixture({ lifecycleStatus: 'open' });
  const service: OpportunityService = {
    createOpportunity: async () => { throw new Error('not expected'); },
    getOpportunity: async () => null,
    getOwnedOpportunity: async () => null,
    updateOwnedOpportunity: async () => { throw new Error('not expected'); },
    transitionOpportunity: async (context, id, status) => {
      assert.equal(context.userId, 55);
      assert.equal(id, expected.id);
      assert.equal(status, 'open');
      return expected;
    },
    listMarketplaceOpportunities: async () => ({ opportunities: [], total: 0, limit: 50, offset: 0 }),
    listOpportunityTypes: async () => [],
  };
  const { server, baseUrl } = await startOpportunityTestServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/opportunities/${expected.id}/transition`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 55, role: 'customer' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ nextStatus: 'open' }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { opportunity: { lifecycleStatus: string } };
    assert.equal(body.opportunity.lifecycleStatus, 'open');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Opportunity transition route rejects unsupported status and extra fields', async () => {
  let called = false;
  const service = {
    transitionOpportunity: async () => { called = true; throw new Error('must not be called'); },
  } as unknown as OpportunityService;
  const { server, baseUrl } = await startOpportunityTestServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/opportunities/301/transition`, {
      method: 'POST',
      headers: { authorization: `Bearer ${tokenFor({ userId: 55, role: 'customer' })}`, 'content-type': 'application/json' },
      body: JSON.stringify({ nextStatus: 'published', ownerAccountId: 99 }),
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});


test('public Project marketplace list applies filters and pagination without authentication', async () => {
  let seen: unknown;
  const publicProjectService: PublicProjectService = {
    listPublicProjects: async input => {
      seen = input;
      return { projects: [publicProjectFixture()], total: 1, limit: input.limit, offset: input.offset };
    },
    getPublicProject: async () => null,
  };
  const projectService = {} as ProjectService;
  const { server, baseUrl } = await startProjectTestServer(projectService, publicProjectService);
  try {
    const response = await fetch(`${baseUrl}/api/v1/public/projects?category=construction&province=KwaZulu-Natal&urgency=urgent&search=kitchen&limit=10&offset=20`);
    assert.equal(response.status, 200);
    const body = await response.json() as { total: number; projects: PublicProject[] };
    assert.equal(body.total, 1);
    assert.equal(body.projects[0]?.id, 101);
    assert.deepEqual(seen, { category: 'construction', province: 'KwaZulu-Natal', urgency: 'urgent', search: 'kitchen', limit: 10, offset: 20 });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('public Project marketplace list rejects invalid pagination', async () => {
  const publicProjectService: PublicProjectService = {
    listPublicProjects: async input => ({ projects: [], total: 0, limit: input.limit, offset: input.offset }),
    getPublicProject: async () => null,
  };
  const projectService = {} as ProjectService;
  const { server, baseUrl } = await startProjectTestServer(projectService, publicProjectService);
  try {
    const response = await fetch(`${baseUrl}/api/v1/public/projects?limit=101`);
    assert.equal(response.status, 400);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('managed Business supplier classification is routed through the authenticated actor gateway', async () => {
  let received: unknown;
  const updated = { id: 201, name: 'Supplier Business', isSupplier: true } as BusinessIdentity;
  const businessIdentityService = {
    getManagedBusiness: async (_context: AuthContext, businessId: number) => businessId === 201 ? updated : null,
    updateBusiness: async () => { throw new Error('supplier classification must not use the legacy repository path'); },
  } as unknown as BusinessIdentityService;
  const gateway: SupplierClassificationGatewayClient = {
    async update(accessToken, businessId, isSupplier) {
      received = { accessToken, businessId, isSupplier };
      return { businessId, isSupplier };
    },
  };
  const { server, baseUrl } = await startTestServer(businessIdentityService, gateway);
  try {
    const token = tokenFor({ userId: 42, role: 'business' });
    const response = await fetch(`${baseUrl}/api/v1/businesses/201`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ isSupplier: true }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, { accessToken: token, businessId: 201, isSupplier: true });
    assert.equal((await response.json() as { business: BusinessIdentity }).business.isSupplier, true);

    const invalid = await fetch(`${baseUrl}/api/v1/businesses/201`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ isSupplier: 'yes' }),
    });
    assert.equal(invalid.status, 400);

    const mixed = await fetch(`${baseUrl}/api/v1/businesses/201`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Changed', isSupplier: false }),
    });
    assert.equal(mixed.status, 400);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('managed Business profile PATCH forwards updates through the authenticated actor gateway', async () => {
  let received: unknown;
  const updated = { id: 201, name: 'Updated Business' } as BusinessIdentity;
  const service = {
    getManagedBusiness: async (_context: AuthContext, businessId: number) => businessId === 201 ? updated : null,
    updateBusiness: async () => { throw new Error('legacy direct profile update path must not be used'); },
  } as unknown as BusinessIdentityService;
  const gateway: BusinessProfileGatewayClient = {
    async update(accessToken, businessId, patch) {
      received = { accessToken, businessId, patch };
    },
  };
  const { server, baseUrl } = await startTestServer(service, undefined, gateway);
  try {
    const token = tokenFor({ userId: 42, role: 'business' });
    const response = await fetch(`${baseUrl}/api/v1/businesses/201`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Business', physicalAddress: 'Durban' }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, {
      accessToken: token,
      businessId: 201,
      patch: { name: 'Updated Business', physicalAddress: 'Durban' },
    });
    assert.equal((await response.json() as { business: BusinessIdentity }).business.id, 201);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('managed Business profile PATCH fails closed when actor gateway is not configured', async () => {
  let legacyCalled = false;
  const service = {
    updateBusiness: async () => { legacyCalled = true; throw new Error('must not be called'); },
  } as unknown as BusinessIdentityService;
  const { server, baseUrl } = await startTestServer(service);
  try {
    const token = tokenFor({ userId: 42, role: 'business' });
    const response = await fetch(`${baseUrl}/api/v1/businesses/201`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Business' }),
    });
    assert.equal(response.status, 503);
    assert.equal(legacyCalled, false);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});


test('Resource API can run without Authentication Issuer routes or token-pepper initialization', async () => {
  const app = createApp({
    authRoutesEnabled: false,
    resourceAuthMiddleware: httpTestAuth,
    businessIdentityService: {} as BusinessIdentityService,
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    for (const path of [
      '/api/v1/auth/register',
      '/api/v1/auth/login',
      '/api/v1/auth/refresh',
      '/api/v1/auth/logout',
      '/api/v1/auth/password-recovery/request',
      '/api/v1/auth/password-recovery/reset',
      '/api/v1/auth/quoteflow-migration-reset/request',
      '/api/v1/auth/quoteflow-migration-reset/complete',
    ]) {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.equal(response.status, 404, path);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
