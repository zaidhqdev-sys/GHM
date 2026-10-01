import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor as es256TokenFor } from './test-resource-auth';
import { AuthContext } from '../auth/authorization';
import type { Notification, NotificationService } from '../resources/notification/contracts';
import type { BusinessIdentityService } from '../resources/business-identity/contracts';

const startServer = async (notificationService: NotificationService) => {
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth,
    businessIdentityService: {} as BusinessIdentityService,
    notificationService,
  }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const fixture = (context: AuthContext, overrides: Partial<Notification> = {}): Notification => ({
  id: 101,
  userId: context.userId,
  type: 'system',
  title: 'System notice',
  body: 'Notification body',
  metadata: { source: 'test' },
  isRead: false,
  readAt: null,
  createdAt: new Date('2026-09-30T00:00:00.000Z'),
  ...overrides,
});

const tokenFor = es256TokenFor;

const close = async (server: http.Server) =>
  await new Promise<void>(resolve => server.close(() => resolve()));

test('notification list route requires authentication', async () => {
  const service = { listNotifications: async () => { throw new Error('must not be called'); } } as unknown as NotificationService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/notifications`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally { await close(server); }
});

test('notification list route binds context and limit', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedLimit: number | undefined;
  const notification = fixture({ userId: 42, role: 'business' });
  const service = {
    listNotifications: async (context: AuthContext, options?: { limit?: number }) => {
      receivedContext = context;
      receivedLimit = options?.limit;
      return [notification];
    },
  } as unknown as NotificationService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/notifications?limit=10`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.equal(receivedLimit, 10);
    const payload = await response.json() as { notifications: Array<{ id: number }> };
    assert.equal(payload.notifications[0].id, 101);
  } finally { await close(server); }
});

test('notification get route rejects invalid id before service execution', async () => {
  let called = false;
  const service = {
    getNotification: async () => { called = true; throw new Error('must not be called'); },
  } as unknown as NotificationService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/notifications/not-an-id`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await close(server); }
});

test('notification create route rejects server-owned fields', async () => {
  let called = false;
  const service = {
    createNotification: async () => { called = true; throw new Error('must not be called'); },
  } as unknown as NotificationService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/notifications`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        userId: 42, type: 'system', title: 'Notice', body: 'Body',
        id: 999, isRead: true, createdAt: 'tamper',
      }),
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await close(server); }
});

test('notification create route binds authenticated context and canonical input', async () => {
  let receivedContext: AuthContext | undefined;
  let receivedInput: unknown;
  const notification = fixture({ userId: 42, role: 'business' });
  const service = {
    createNotification: async (context: AuthContext, input: unknown) => {
      receivedContext = context;
      receivedInput = input;
      return notification;
    },
  } as unknown as NotificationService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/notifications`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` ,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        userId: 42, type: 'system', title: ' Notice ', body: ' Body ', metadata: { source: 'test' },
      }),
    });
    assert.equal(response.status, 201);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.deepEqual(receivedInput, {
      userId: 42, type: 'system', title: ' Notice ', body: ' Body ', metadata: { source: 'test' },
    });
  } finally { await close(server); }
});

test('notification patch route only exposes mark-read', async () => {
  let received: { context: AuthContext; id: number } | undefined;
  const service = {
    markNotificationRead: async (context: AuthContext, id: number) => {
      received = { context, id };
      return fixture(context, { id, isRead: true, readAt: new Date() });
    },
  } as unknown as NotificationService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/notifications/101`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` ,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ isRead: true }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received?.context, { userId: 42, role: 'business' });
    assert.equal(received?.id, 101);
  } finally { await close(server); }
});

test('notification patch route rejects arbitrary mutation', async () => {
  let called = false;
  const service = {
    markNotificationRead: async () => { called = true; throw new Error('must not be called'); },
  } as unknown as NotificationService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/notifications/101`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ title: 'tampered' }),
    });
    assert.equal(response.status, 400);
    assert.equal(called, false);
  } finally { await close(server); }
});

test('notification read-all route returns affected count', async () => {
  let receivedContext: AuthContext | undefined;
  const service = {
    markAllNotificationsRead: async (context: AuthContext) => {
      receivedContext = context;
      return 3;
    },
  } as unknown as NotificationService;
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/notifications/read-all`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` ,
        'content-type': 'application/json',
      },
      body: '{}',
    });
    assert.equal(response.status, 200);
    assert.deepEqual(receivedContext, { userId: 42, role: 'business' });
    assert.deepEqual(await response.json(), { count: 3 });
  } finally { await close(server); }
});
