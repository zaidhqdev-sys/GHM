import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor } from './test-resource-auth';
import { AuthContext } from '../auth/authorization';
import { Project, ProjectService } from '../resources/project/contracts';
import { PublicProject, PublicProjectService } from '../resources/project/public-contracts';
import { AccountIdentity, BusinessIdentityService } from '../resources/business-identity/contracts';
import { PublicBusiness, PublicBusinessService } from '../resources/business-identity/public-contracts';
import { DirectoryResult, DirectoryService } from '../resources/directory/contracts';

const profile = (context: AuthContext): AccountIdentity => ({
  id: context.userId,
  email: 'http-user@example.com',
  fullName: 'HTTP Qualification User',
  phone: null,
  avatarRef: null,
  role: context.role,
  createdAt: new Date('2026-09-10T00:00:00.000Z'),
  updatedAt: new Date('2026-09-10T00:00:00.000Z'),
});

const startTestServer = async (service: BusinessIdentityService) => {
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth, businessIdentityService: service }));
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
  category: 'construction',
  province: 'KwaZulu-Natal',
  city: 'Durban',
  physicalAddress: null,
  whatsapp: null,
  website: null,
  logoUrl: null,
  avatarLetter: 'P',
  avatarColor: '#123456',
  isSupplier: false,
  tier: 'free',
  isFeatured: false,
  profileViews: 0,
  yearsInBusiness: 0,
  rating: 4.5,
  reviewCount: 12,
  jobsCompleted: 8,
  verificationStatus: 'approved',
  isVerified: true,
  createdAt: new Date('2026-09-10T00:00:00.000Z'),
  updatedAt: new Date('2026-09-10T00:00:00.000Z'),
  ...overrides,
} as PublicBusiness);

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
    listPublicCategories: async () => [],
    search: async query => {
      received = query;
      return result;
    },
  };
  const { server, baseUrl } = await startDirectoryTestServer(directoryService);
  try {
    const response = await fetch(`${baseUrl}/api/v1/public/businesses?q=build&category=construction&province=KwaZulu-Natal&city=Durban&sort=reviews&businessType=contractors&page=1&pageSize=20`);
    assert.equal(response.status, 200);
    assert.deepEqual(received, { q: 'build', category: 'construction', province: 'KwaZulu-Natal', city: 'Durban', sort: 'reviews', businessType: 'contractors', page: 1, pageSize: 20 });
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
    listPublicCategories: async () => [],
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
    assert.deepEqual(received, { q: undefined, category: undefined, province: undefined, city: undefined, sort: undefined, businessType: undefined, page: 1, pageSize: 20 });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('public directory route rejects unsupported and malformed query parameters before service execution', async () => {
  let called = false;
  const directoryService: DirectoryService = {
    listPublicCategories: async () => [],
    search: async () => {
      called = true;
      throw new Error('must not be called');
    },
  };
  const { server, baseUrl } = await startDirectoryTestServer(directoryService);
  try {
    const unsupported = await fetch(`${baseUrl}/api/v1/public/businesses?radius=50`);
    assert.equal(unsupported.status, 400);

    const malformed = await fetch(`${baseUrl}/api/v1/public/businesses?page=0`);
    assert.equal(malformed.status, 400);

    const invalidSort = await fetch(`${baseUrl}/api/v1/public/businesses?sort=distance`);
    assert.equal(invalidSort.status, 400);

    const oversized = await fetch(`${baseUrl}/api/v1/public/businesses?pageSize=51`);
    assert.equal(oversized.status, 400);

    assert.equal(called, false);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});


test('public directory route rejects invalid province and business type filters', async () => {
  let called = false;
  const directoryService: DirectoryService = {
    listPublicCategories: async () => [],
    search: async () => {
      called = true;
      return { items: [], page: 1, pageSize: 20, total: 0 };
    },
  };
  const { server, baseUrl } = await startDirectoryTestServer(directoryService);
  try {
    const invalidType = await fetch(`${baseUrl}/api/v1/public/businesses?businessType=everyone`);
    assert.equal(invalidType.status, 400);
    const blankProvince = await fetch(`${baseUrl}/api/v1/public/businesses?province=%20%20`);
    assert.equal(blankProvince.status, 400);
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


test('canonical identity route rejects missing authentication', async () => {
  const service = { getIdentityContext: async () => { throw new Error('must not be called'); } } as unknown as BusinessIdentityService;
  const { server, baseUrl } = await startTestServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/identity`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('canonical identity route returns a QuoteFlow-compatible selected identity DTO', async () => {
  let received: { context: AuthContext; selectedBusinessId?: number } | undefined;
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const business = {
    id: 201, name: 'Canonical Business', slug: 'canonical-business', description: null, phone: null, email: null,
    category: null, province: null, city: null, physicalAddress: null, whatsapp: null, website: null,
    isSupplier: null, yearsInBusiness: 0, insuranceVerified: false, jobsCompleted: 0,
    verificationStatus: 'unverified', isActive: true, createdAt, updatedAt: createdAt,
  };
  const membership = {
    id: 501, accountId: 42, businessId: 201, role: 'owner', status: 'active', createdBy: 42,
    createdAt, updatedAt: createdAt, business,
  };
  const identity = {
    account: profile({ userId: 42, role: 'business' }),
    memberships: [membership],
    activeMembership: membership,
    activeBusiness: business,
  };
  const service = { getIdentityContext: async (input: { context: AuthContext; selectedBusinessId?: number }) => { received = input; return identity; } } as unknown as BusinessIdentityService;
  const { server, baseUrl } = await startTestServer(service);
  try {
    const token = tokenFor({ userId: 42, role: 'business' });
    const response = await fetch(`${baseUrl}/api/v1/identity?businessId=201`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    assert.deepEqual(received, { context: { userId: 42, role: 'business' }, selectedBusinessId: 201 });
    const body = await response.json() as typeof identity;
    assert.equal(body.account.id, 42);
    assert.equal(body.account.email, 'http-user@example.com');
    assert.equal(body.memberships[0].businessId, 201);
    assert.equal(body.memberships[0].createdBy, 42);
    assert.equal(typeof body.memberships[0].createdAt, 'string');
    assert.equal(body.activeMembership.businessId, 201);
    assert.equal(body.activeBusiness.id, 201);
    assert.equal(body.activeBusiness.slug, 'canonical-business');
    assert.equal(typeof body.activeBusiness.updatedAt, 'string');
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('canonical identity route returns multiple membership choices without selecting a business', async () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const membership = (id: number, businessId: number, role: 'owner' | 'member') => ({
    id, accountId: 42, businessId, role, status: 'active', createdBy: 42,
    createdAt, updatedAt: createdAt,
    business: {
      id: businessId, name: `Business ${businessId}`, slug: `business-${businessId}`,
      description: null, phone: null, email: null, category: null, province: null, city: null,
      physicalAddress: null, whatsapp: null, website: null, isSupplier: null, yearsInBusiness: 0,
      insuranceVerified: false, jobsCompleted: 0, verificationStatus: 'unverified', isActive: true,
      createdAt, updatedAt: createdAt,
    },
  });
  const identity = {
    account: profile({ userId: 42, role: 'business' }),
    memberships: [membership(501, 201, 'owner'), membership(502, 202, 'member')],
    activeMembership: null,
    activeBusiness: null,
  };
  const service = { getIdentityContext: async () => identity } as unknown as BusinessIdentityService;
  const { server, baseUrl } = await startTestServer(service);
  try {
    const token = tokenFor({ userId: 42, role: 'business' });
    const response = await fetch(`${baseUrl}/api/v1/identity`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 200);
    const body = await response.json() as typeof identity;
    assert.equal(body.memberships.length, 2);
    assert.equal(body.activeMembership, null);
    assert.equal(body.activeBusiness, null);
    assert.equal(typeof body.memberships[0].createdAt, 'string');
    assert.equal(typeof body.memberships[0].business?.createdAt, 'string');
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('canonical identity route rejects unknown, repeated and malformed query parameters', async () => {
  let called = false;
  const service = { getIdentityContext: async () => { called = true; throw new Error('must not be called'); } } as unknown as BusinessIdentityService;
  const { server, baseUrl } = await startTestServer(service);
  try {
    const token = tokenFor({ userId: 42, role: 'business' });
    for (const query of ['?businessId=0', '?businessId=-1', '?businessId=1.5', '?businessId=abc', '?businessId=9007199254740992', '?businessId=1&businessId=2', '?accountId=999']) {
      const response = await fetch(`${baseUrl}/api/v1/identity${query}`, { headers: { authorization: `Bearer ${token}` } });
      assert.equal(response.status, 400, query);
      assert.deepEqual(await response.json(), { error: 'invalid_request' });
    }
    assert.equal(called, false);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('canonical identity route conceals unauthorized business selection as not found', async () => {
  const service = { getIdentityContext: async () => { throw new Error('Selected business context is not authorized'); } } as unknown as BusinessIdentityService;
  const { server, baseUrl } = await startTestServer(service);
  try {
    const token = tokenFor({ userId: 42, role: 'business' });
    const response = await fetch(`${baseUrl}/api/v1/identity?businessId=999`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('canonical identity route rejects invalid bearer tokens before service execution', async () => {
  const service = { getIdentityContext: async () => { throw new Error('must not be called'); } } as unknown as BusinessIdentityService;
  const { server, baseUrl } = await startTestServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/identity`, { headers: { authorization: 'Bearer not-a-valid-token' } });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test('business profile PATCH accepts owner-managed directory fields but excludes protected fields', async () => {
  let received: unknown;
  const service = {
    updateBusiness: async (context: AuthContext, businessId: number, input: unknown) => {
      received = { context, businessId, input };
      return {
        id: businessId, name: 'Business', slug: 'business', description: null, phone: null, email: null,
        category: 'construction', province: 'KwaZulu-Natal', city: 'Durban', physicalAddress: null,
        whatsapp: null, website: 'https://example.com', isSupplier: null, yearsInBusiness: 4,
        insuranceVerified: false, jobsCompleted: 0, verificationStatus: 'unverified', isActive: true,
        createdAt: new Date(0), updatedAt: new Date(0),
      };
    },
  } as unknown as BusinessIdentityService;
  const { server, baseUrl } = await startTestServer(service);
  try {
    const token = tokenFor({ userId: 42, role: 'business' });
    const response = await fetch(`${baseUrl}/api/v1/businesses/201`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ category: 'construction', province: 'KwaZulu-Natal', city: 'Durban', website: 'https://example.com', isSupplier: null, yearsInBusiness: 4 }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, {
      context: { userId: 42, role: 'business' },
      businessId: 201,
      input: { category: 'construction', province: 'KwaZulu-Natal', city: 'Durban', website: 'https://example.com', isSupplier: null, yearsInBusiness: 4 },
    });
    for (const body of [
      { isFeatured: true }, { tier: 'premium' }, { logoUrl: 'https://example.com/logo.png' },
      { isVerified: true }, { rating: 5 }, { isSupplier: 'yes' }, { yearsInBusiness: 501 }, { category: 'Not A Slug' }, { website: 'javascript:alert(1)' },
    ]) {
      const invalid = await fetch(`${baseUrl}/api/v1/businesses/201`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(invalid.status, 400, JSON.stringify(body));
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('own-profile PATCH stores declared Connect role and operator intent through authenticated context', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedInput: unknown;
  const service = {
    updateOwnProfile: async (context: AuthContext, input: unknown) => {
      receivedContext = context;
      receivedInput = input;
      return { ...profile(context), connectRole: 'contractor', businessOperatorIntent: true };
    },
  } as unknown as BusinessIdentityService;
  const { server, baseUrl } = await startTestServer(service);
  try {
    const token = tokenFor({ userId: 42, role: 'customer' });
    const response = await fetch(`${baseUrl}/api/v1/profile`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ connectRole: 'contractor', businessOperatorIntent: true }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'customer' });
    assert.deepEqual(receivedInput, { connectRole: 'contractor', businessOperatorIntent: true });
    const body = await response.json() as { profile: AccountIdentity };
    assert.equal(body.profile.connectRole, 'contractor');
    assert.equal(body.profile.businessOperatorIntent, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('own-profile PATCH rejects unknown Connect role and protected fields before service call', async () => {
  let called = false;
  const service = {
    updateOwnProfile: async () => { called = true; throw new Error('must not be called'); },
  } as unknown as BusinessIdentityService;
  const { server, baseUrl } = await startTestServer(service);
  try {
    const token = tokenFor({ userId: 42, role: 'customer' });
    for (const body of [
      { connectRole: 'admin' },
      { connectRole: 'business' },
      { isSystemAdmin: true },
      { isDirectoryListingFounderReviewer: true },
      { businessOperatorIntent: 'yes' },
      {},
    ]) {
      const response = await fetch(`${baseUrl}/api/v1/profile`, {
        method: 'PATCH',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'invalid_request' });
    }
    assert.equal(called, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});


test('lazy auth service uses the app-injected auth persistence for reset session issuance', async (t) => {
  const authModule = require('../auth/ghm-auth-service') as typeof import('../auth/ghm-auth-service');
  const authPersistence = {} as never;
  let receivedPersistence: unknown;
  let loginCalled = false;
  t.mock.method(authModule, 'createGhmAuthService', (persistence) => {
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

test('public business category route returns the filtered GHM taxonomy without requiring a session', async () => {
  const categories = [{ id: 'cat-1', slug: 'construction', name: 'Construction' }];
  const directoryService: DirectoryService = {
    listPublicCategories: async () => categories,
    search: async query => ({ items: [], page: query.page, pageSize: query.pageSize, total: 0 }),
  };
  const { server, baseUrl } = await startDirectoryTestServer(directoryService);
  try {
    const response = await fetch(`${baseUrl}/api/v1/public/business-categories`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { categories });
  } finally {
    server.close();
  }
});
