import assert from 'node:assert/strict';
import test from 'node:test';
import type { AuthContext } from '../../auth/authorization';
import type { CreateNotificationInput, Notification, NotificationRepository } from './contracts';
import { NotificationServiceImpl } from './service';

const context: AuthContext = { userId: 7, role: 'customer' };
const admin: AuthContext = { userId: 9, role: 'admin' };

const notification: Notification = {
  id: 1,
  userId: 7,
  type: 'system',
  title: 'Hello',
  body: 'System message',
  metadata: {},
  isRead: false,
  readAt: null,
  createdAt: new Date(),
};

const repository = (overrides: Partial<NotificationRepository> = {}): NotificationRepository => ({
  createNotification: async () => notification,
  getNotification: async () => notification,
  listNotifications: async () => [notification],
  markNotificationRead: async () => ({ ...notification, isRead: true, readAt: new Date() }),
  markAllNotificationsRead: async () => 1,
  ...overrides,
});

const validInput: CreateNotificationInput = {
  userId: 7,
  type: 'system',
  title: '  Hello  ',
  body: '  System message  ',
};

test('Notification service trims create text before repository call', async () => {
  let received: CreateNotificationInput | undefined;
  const service = new NotificationServiceImpl(repository({
    createNotification: async (_context, input) => {
      received = input;
      return notification;
    },
  }));

  await service.createNotification(context, validInput);
  assert.deepEqual(received, { ...validInput, title: 'Hello', body: 'System message', metadata: {} });
});

test('Notification service rejects unsupported type', async () => {
  const service = new NotificationServiceImpl(repository());
  await assert.rejects(
    service.createNotification(context, { ...validInput, type: 'payment' as never }),
    /Invalid Notification type/,
  );
});

test('Notification service rejects non-object metadata', async () => {
  const service = new NotificationServiceImpl(repository());
  await assert.rejects(
    service.createNotification(context, { ...validInput, metadata: [] as never }),
    /metadata must be an object/,
  );
});

test('Notification service enforces recipient ownership for non-admin creation', async () => {
  const service = new NotificationServiceImpl(repository());
  await assert.rejects(
    service.createNotification(context, { ...validInput, userId: 8 }),
    /Notification recipient permission required/,
  );
});

test('Notification service permits admin creation for another recipient', async () => {
  let called = false;
  const service = new NotificationServiceImpl(repository({
    createNotification: async () => {
      called = true;
      return notification;
    },
  }));

  await service.createNotification(admin, { ...validInput, userId: 8 });
  assert.equal(called, true);
});

test('Notification service does not invent lead identity mapping', async () => {
  const service = new NotificationServiceImpl(repository());
  await assert.rejects(
    service.createNotification(context, { ...validInput, type: 'lead', userId: 8 }),
    /Lead notification identity mapping is not established/,
  );
});
