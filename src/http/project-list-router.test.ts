import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor } from './test-resource-auth';
import type { AuthContext } from '../auth/authorization';
import type { Project, ProjectPage, ProjectService } from '../resources/project/contracts';

const project: Project = {
  id: 21, accountId: 10, title: 'Customer Project',
  description: 'A sufficiently detailed customer project description.',
  category: 'Construction', province: 'KwaZulu-Natal', city: 'Durban',
  budgetMin: 1000, budgetMax: 5000, urgency: 'standard', status: 'open',
  quoteCount: 2, createdAt: new Date(0), updatedAt: new Date(0),
};
const start = async (service: ProjectService, context: AuthContext) => {
  const app = createApp({ resourceAuthMiddleware: httpTestAuth, projectService: service });
  app.use((req, _res, next) => { req.authContext = context; next(); });
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};
const close = (server: http.Server) => new Promise<void>(resolve => server.close(() => resolve()));

test('customer Project list returns account-scoped paginated results', async () => {
  let seen: [AuthContext, number, number] | null = null;
  const service: ProjectService = {
    listOwnedProjects: async (context, limit, offset): Promise<ProjectPage> => {
      seen = [context, limit, offset];
      return { projects: [project], total: 1, limit, offset };
    },
    createProject: async () => project,
    getOwnedProject: async () => project,
    updateOwnedProject: async () => project,
  };
  const context = { userId: 10, role: 'customer' as const };
  const { server, baseUrl } = await start(service, context);
  try {
    const response = await fetch(`${baseUrl}/api/v1/projects?limit=10&offset=20`, {
      headers: { Authorization: `Bearer ${tokenFor(context)}` },
    });
    assert.equal(response.status, 200);
    const body = await response.json() as ProjectPage;
    assert.equal(body.total, 1);
    assert.equal(body.projects[0]?.quoteCount, 2);
    assert.deepEqual(seen, [context, 10, 20]);
  } finally { await close(server); }
});

test('Project list denies non-customer roles', async () => {
  const context = { userId: 31, role: 'business' as const };
  const service: ProjectService = {
    listOwnedProjects: async () => ({ projects: [], total: 0, limit: 50, offset: 0 }),
    createProject: async () => project,
    getOwnedProject: async () => project,
    updateOwnedProject: async () => project,
  };
  const { server, baseUrl } = await start(service, context);
  try {
    const response = await fetch(`${baseUrl}/api/v1/projects`, {
      headers: { Authorization: `Bearer ${tokenFor(context)}` },
    });
    assert.equal(response.status, 403);
  } finally { await close(server); }
});

test('Project list rejects invalid pagination', async () => {
  const context = { userId: 10, role: 'customer' as const };
  const service: ProjectService = {
    listOwnedProjects: async () => ({ projects: [], total: 0, limit: 50, offset: 0 }),
    createProject: async () => project,
    getOwnedProject: async () => project,
    updateOwnedProject: async () => project,
  };
  const { server, baseUrl } = await start(service, context);
  try {
    const response = await fetch(`${baseUrl}/api/v1/projects?limit=101`, {
      headers: { Authorization: `Bearer ${tokenFor(context)}` },
    });
    assert.equal(response.status, 400);
  } finally { await close(server); }
});

test('customer can read only an owned Project through the detail route', async () => {
  let seen: [AuthContext, number] | null = null;
  const service: ProjectService = {
    listOwnedProjects: async () => ({ projects: [], total: 0, limit: 50, offset: 0 }),
    createProject: async () => project,
    getOwnedProject: async (context, projectId) => { seen = [context, projectId]; return project; },
    updateOwnedProject: async () => project,
  };
  const context = { userId: 10, role: 'customer' as const };
  const { server, baseUrl } = await start(service, context);
  try {
    const response = await fetch(`${baseUrl}/api/v1/projects/21`, {
      headers: { Authorization: `Bearer ${tokenFor(context)}` },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { project: Project }).project.id, 21);
    assert.deepEqual(seen, [context, 21]);
  } finally { await close(server); }
});

test('Project detail returns not found when the authenticated owner has no matching Project', async () => {
  const context = { userId: 10, role: 'customer' as const };
  const service: ProjectService = {
    listOwnedProjects: async () => ({ projects: [], total: 0, limit: 50, offset: 0 }),
    createProject: async () => project,
    getOwnedProject: async () => null,
    updateOwnedProject: async () => project,
  };
  const { server, baseUrl } = await start(service, context);
  try {
    const response = await fetch(`${baseUrl}/api/v1/projects/999`, {
      headers: { Authorization: `Bearer ${tokenFor(context)}` },
    });
    assert.equal(response.status, 404);
  } finally { await close(server); }
});

test('customer can update an owned Project through the detail route', async () => {
  let seen: [AuthContext, number, unknown] | null = null;
  const service: ProjectService = {
    listOwnedProjects: async () => ({ projects: [], total: 0, limit: 50, offset: 0 }),
    createProject: async () => project,
    getOwnedProject: async () => project,
    updateOwnedProject: async (context, projectId, input) => { seen = [context, projectId, input]; return project; },
  };
  const context = { userId: 10, role: 'customer' as const };
  const { server, baseUrl } = await start(service, context);
  try {
    const response = await fetch(`${baseUrl}/api/v1/projects/21`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenFor(context)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Project Title' }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { project: Project }).project.id, 21);
    assert.deepEqual(seen, [context, 21, { title: 'Updated Project Title' }]);
  } finally { await close(server); }
});

test('Project detail and update deny non-customer non-admin roles', async () => {
  const context = { userId: 31, role: 'business' as const };
  const service: ProjectService = {
    listOwnedProjects: async () => ({ projects: [], total: 0, limit: 50, offset: 0 }),
    createProject: async () => project,
    getOwnedProject: async () => project,
    updateOwnedProject: async () => project,
  };
  const { server, baseUrl } = await start(service, context);
  try {
    const get = await fetch(`${baseUrl}/api/v1/projects/21`, { headers: { Authorization: `Bearer ${tokenFor(context)}` } });
    const patch = await fetch(`${baseUrl}/api/v1/projects/21`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${tokenFor(context)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Updated Project Title' }),
    });
    assert.equal(get.status, 403);
    assert.equal(patch.status, 403);
  } finally { await close(server); }
});
