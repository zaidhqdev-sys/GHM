import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import type { AuthContext } from '../auth/authorization';
import type { ProjectQuoteService } from '../resources/project-quote/contracts';
import { registerProjectQuoteRoutes } from './project-quote-router';

const makeApp = (service: ProjectQuoteService, context?: AuthContext) => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (context) req.authContext = context;
    next();
  });
  registerProjectQuoteRoutes(app, service);
  return app;
};

const quote = {
  id: 11, projectId: 21, businessId: 31, amount: 15000,
  labourMin: 5000, labourMax: 7000, materialsMin: 7000, materialsMax: 9000,
  totalMin: 12000, totalMax: 16000, durationDays: 30,
  description: 'A governed Project Quote fixture.', status: 'submitted' as const,
  createdAt: new Date(0), updatedAt: new Date(0),
};

const service: ProjectQuoteService = {
  async readReceived(_c, projectId) { assert.equal(projectId, 21); return [quote]; },
  async readOwn(_c, businessId) { assert.equal(businessId, 31); return [quote]; },
  async create(_c, input) { assert.equal(input.businessId, 31); return quote; },
  async update(_c, id, input) { assert.equal(id, 11); assert.equal(input.amount, 17500); return quote; },
  async accept(_c, id) { assert.equal(id, 11); return { ...quote, status: 'accepted' }; },
  async reject(_c, id) { assert.equal(id, 11); return { ...quote, status: 'rejected' }; },
};

test('Project Quote received list requires customer authorization', async () => {
  const app = makeApp(service, { userId: 10, role: 'business' });
  const response = await request(app).get('/api/v1/projects/21/quotes');
  assert.equal(response.status, 403);
});

test('Project Quote received list binds project id and context', async () => {
  const app = makeApp(service, { userId: 10, role: 'customer' });
  const response = await request(app).get('/api/v1/projects/21/quotes');
  assert.equal(response.status, 200);
  assert.equal(response.body.quotes[0].id, 11);
});

test('Project Quote own list requires business role', async () => {
  const app = makeApp(service, { userId: 10, role: 'customer' });
  const response = await request(app).get('/api/v1/businesses/31/project-quotes');
  assert.equal(response.status, 403);
});

test('Project Quote creation rejects server-owned fields', async () => {
  const app = makeApp(service, { userId: 10, role: 'business' });
  const response = await request(app).post('/api/v1/project-quotes').send({ ...quote, projectId: 21, businessId: 31 });
  assert.equal(response.status, 400);
});

test('Project Quote creation uses canonical input', async () => {
  const app = makeApp(service, { userId: 10, role: 'business' });
  const response = await request(app).post('/api/v1/project-quotes').send({
    projectId: 21, businessId: 31, amount: 15000, description: 'A governed Project Quote fixture.',
  });
  assert.equal(response.status, 201);
});

test('Project Quote update rejects arbitrary fields', async () => {
  const app = makeApp(service, { userId: 10, role: 'business' });
  const response = await request(app).patch('/api/v1/project-quotes/11').send({ status: 'accepted' });
  assert.equal(response.status, 400);
});

test('Project Quote update accepts canonical editable fields', async () => {
  const app = makeApp(service, { userId: 10, role: 'business' });
  const response = await request(app).patch('/api/v1/project-quotes/11').send({ amount: 17500 });
  assert.equal(response.status, 200);
});

test('Project Quote accept and reject are explicit operations', async () => {
  const app = makeApp(service, { userId: 10, role: 'customer' });
  const accepted = await request(app).post('/api/v1/project-quotes/11/accept').send({});
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.quote.status, 'accepted');
  const rejected = await request(app).post('/api/v1/project-quotes/11/reject').send({});
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.quote.status, 'rejected');
});

test('Project Quote decision rejects a non-empty request body', async () => {
  const app = makeApp(service, { userId: 10, role: 'customer' });
  const response = await request(app).post('/api/v1/project-quotes/11/accept').send({ status: 'accepted' });
  assert.equal(response.status, 400);
});

test('Project Quote routes require authentication', async () => {
  const app = makeApp(service);
  const response = await request(app).get('/api/v1/projects/21/quotes');
  assert.equal(response.status, 401);
});
