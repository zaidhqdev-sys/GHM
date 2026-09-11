import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from './app';
import { AuthContext } from '../auth/authorization';
import { config } from '../config';
import { Project, ProjectService } from '../resources/project/contracts';
import { PublicProject, PublicProjectService } from '../resources/project/public-contracts';
import { AccountIdentity, BusinessIdentityService } from '../resources/business-identity/contracts';

const profile = (context: AuthContext): AccountIdentity => ({
  id: context.userId,
  fullName: 'HTTP Qualification User',
  phone: null,
  avatarRef: null,
  role: context.role,
  createdAt: new Date('2026-09-10T00:00:00.000Z'),
  updatedAt: new Date('2026-09-10T00:00:00.000Z'),
});

const startTestServer = async (service: BusinessIdentityService) => {
  const server = http.createServer(createApp({ businessIdentityService: service }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

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
    const token = jwt.sign({ userId: 42, role: 'business' }, config.jwtSecret);
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
  const server = http.createServer(createApp({
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
    const token = jwt.sign(
      { sub: '999', role: 'business' },
      config.jwtSecret,
    );

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
    const token = jwt.sign({ userId: 42, role: 'business' }, config.jwtSecret);

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
    const token = jwt.sign({ userId: 42, role: 'business' }, config.jwtSecret);

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
    const token = jwt.sign({ userId: 42, role: 'customer' }, config.jwtSecret);

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
    const token = jwt.sign({ userId: 99, role: 'business' }, config.jwtSecret);

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
    const token = jwt.sign({ userId: 42, role: 'business' }, config.jwtSecret);

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
    const token = jwt.sign({ userId: 42, role: 'business' }, config.jwtSecret);

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
    const token = jwt.sign({ userId: 42, role: 'business' }, config.jwtSecret);

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
    const token = jwt.sign({ userId: 42, role: 'business' }, config.jwtSecret);

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
