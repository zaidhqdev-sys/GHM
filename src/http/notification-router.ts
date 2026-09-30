import { Express, Request, Response } from 'express';
import { AuthContext, canAccessResource } from '../auth/authorization';
import { requireAuth } from '../auth/http';
import { isRegisteredOperation } from '../resources/registry';
import type { CreateNotificationInput, NotificationService, NotificationType } from '../resources/notification/contracts';

const routeParam = (value: string | string[]): string | null =>
  typeof value === 'string' ? value : null;

const positiveIntegerId = (value: string): number | null => {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const notificationTypes: readonly NotificationType[] =
  ['system', 'lead', 'verification', 'project', 'quote', 'message'];

const parseCreateInput = (body: unknown): CreateNotificationInput | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  const allowed = new Set(['userId', 'type', 'title', 'body', 'metadata']);
  if (Object.keys(input).some(key => !allowed.has(key))) return null;
  if (!Number.isSafeInteger(input.userId) || (input.userId as number) <= 0) return null;
  if (!notificationTypes.includes(input.type as NotificationType)) return null;
  if (typeof input.title !== 'string' || !input.title.trim()) return null;
  if (typeof input.body !== 'string' || !input.body.trim()) return null;
  if (Object.hasOwn(input, 'metadata') &&
      (input.metadata === null || typeof input.metadata !== 'object' || Array.isArray(input.metadata))) return null;
  return {
    userId: input.userId as number,
    type: input.type as NotificationType,
    title: input.title as string,
    body: input.body as string,
    ...(Object.hasOwn(input, 'metadata')
      ? { metadata: input.metadata as Record<string, unknown> }
      : {}),
  };
};

const parseLimit = (value: unknown): number | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null as never;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : null as never;
};

const requireNotificationAccess = (
  operation: 'read' | 'create' | 'update',
) => (req: Request, res: Response, next: () => void): void => {
  const context = req.authContext as AuthContext | undefined;
  if (!context || !isRegisteredOperation('notification', operation) ||
      !canAccessResource(context, 'notification')) {
    res.status(403).json({ error: 'forbidden' });
    return;
  }
  next();
};

const handleNotificationError = (error: unknown, res: Response): void => {
  if (error instanceof Error) {
    if (error.message === 'Notification not found' ||
        error.message === 'Notification recipient not found') {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (error.message === 'Notification recipient permission required' ||
        error.message === 'Lead notification identity mapping is not established') {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    if (error.message === 'Invalid notificationId' ||
        error.message === 'Invalid notification limit' ||
        error.message.includes(' is required') ||
        error.message.startsWith('Invalid Notification type') ||
        error.message === 'metadata must be an object' ||
        error.message.startsWith('Invalid title') ||
        error.message.startsWith('Invalid body')) {
      res.status(400).json({ error: 'invalid_request' });
      return;
    }
  }
  console.error(JSON.stringify({
    event: 'http_request_failed',
    error: { name: error instanceof Error ? error.name : 'UnknownError' },
  }));
  res.status(500).json({ error: 'internal_error' });
};

export const registerNotificationRoutes = (app: Express, notificationService: NotificationService): void => {
  app.get('/api/v1/notifications', requireAuth, requireNotificationAccess('read'),
    async (req: Request, res: Response) => {
      try {
        const limit = parseLimit(req.query.limit);
        if (req.query.limit !== undefined && limit === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const context = req.authContext as AuthContext;
        const notifications = await notificationService.listNotifications(context, { ...(limit === undefined ? {} : { limit }) });
        res.status(200).json({ notifications });
      } catch (error) {
        handleNotificationError(error, res);
      }
    });

  app.get('/api/v1/notifications/:notificationId', requireAuth, requireNotificationAccess('read'),
    async (req: Request, res: Response) => {
      try {
        const value = routeParam(req.params.notificationId);
        const notificationId = value === null ? null : positiveIntegerId(value);
        if (notificationId === null) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const context = req.authContext as AuthContext;
        const notification = await notificationService.getNotification(context, notificationId);
        if (!notification) {
          res.status(404).json({ error: 'not_found' });
          return;
        }
        res.status(200).json({ notification });
      } catch (error) {
        handleNotificationError(error, res);
      }
    });

  app.post('/api/v1/notifications', requireAuth, requireNotificationAccess('create'),
    async (req: Request, res: Response) => {
      try {
        const input = parseCreateInput(req.body);
        if (!input) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const context = req.authContext as AuthContext;
        const notification = await notificationService.createNotification(context, input);
        res.status(201).json({ notification });
      } catch (error) {
        handleNotificationError(error, res);
      }
    });

  app.patch('/api/v1/notifications/:notificationId', requireAuth, requireNotificationAccess('update'),
    async (req: Request, res: Response) => {
      try {
        const value = routeParam(req.params.notificationId);
        const notificationId = value === null ? null : positiveIntegerId(value);
        if (notificationId === null ||
            !req.body || typeof req.body !== 'object' || Array.isArray(req.body) ||
            Object.keys(req.body as Record<string, unknown>).length !== 1 ||
            (req.body as Record<string, unknown>).isRead !== true) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const context = req.authContext as AuthContext;
        const notification = await notificationService.markNotificationRead(context, notificationId);
        res.status(200).json({ notification });
      } catch (error) {
        handleNotificationError(error, res);
      }
    });

  app.post('/api/v1/notifications/read-all', requireAuth, requireNotificationAccess('update'),
    async (req: Request, res: Response) => {
      try {
        if (req.body !== undefined && req.body !== null &&
            (typeof req.body !== 'object' || Array.isArray(req.body) ||
             Object.keys(req.body as Record<string, unknown>).length !== 0)) {
          res.status(400).json({ error: 'invalid_request' });
          return;
        }
        const context = req.authContext as AuthContext;
        const count = await notificationService.markAllNotificationsRead(context);
        res.status(200).json({ count });
      } catch (error) {
        handleNotificationError(error, res);
      }
    });
};
