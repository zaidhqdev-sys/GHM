import type { AuthContext } from '../../auth/authorization';
import type {
  CreateNotificationInput,
  ListNotificationsOptions,
  Notification,
  NotificationRepository,
  NotificationService,
  NotificationType,
} from './contracts';

const TYPES: readonly NotificationType[] = ['system', 'lead', 'verification', 'project', 'quote', 'message'];

const normalizeText = (value: unknown, field: string, maxLength: number): string => {
  if (typeof value !== 'string') throw new Error(`${field} is required`);
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > maxLength) throw new Error(`Invalid ${field}`);
  return normalized;
};

const assertPositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`Invalid ${field}`);
  return value as number;
};

const validateCreateInput = (input: CreateNotificationInput): CreateNotificationInput => {
  if (!input || typeof input !== 'object') throw new Error('Notification input is required');

  const userId = assertPositiveId(input.userId, 'userId');
  if (!TYPES.includes(input.type)) throw new Error('Invalid Notification type');

  const metadata = input.metadata ?? {};
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('metadata must be an object');
  }

  return {
    userId,
    type: input.type,
    title: normalizeText(input.title, 'title', 160),
    body: normalizeText(input.body, 'body', 2000),
    metadata,
  };
};

export class NotificationServiceImpl implements NotificationService {
  constructor(private readonly repository: NotificationRepository) {}

  async createNotification(context: AuthContext, input: CreateNotificationInput): Promise<Notification> {
    const validated = validateCreateInput(input);
    if (context.role !== 'admin' && validated.userId !== context.userId) {
      if (validated.type === 'lead') throw new Error('Lead notification identity mapping is not established');
      throw new Error('Notification recipient permission required');
    }
    return this.repository.createNotification(context, validated);
  }

  async getNotification(context: AuthContext, notificationId: number): Promise<Notification | null> {
    return this.repository.getNotification(context, assertPositiveId(notificationId, 'notificationId'));
  }

  async listNotifications(context: AuthContext, options?: ListNotificationsOptions): Promise<Notification[]> {
    return this.repository.listNotifications(context, options);
  }

  async markNotificationRead(context: AuthContext, notificationId: number): Promise<Notification> {
    return this.repository.markNotificationRead(context, assertPositiveId(notificationId, 'notificationId'));
  }

  async markAllNotificationsRead(context: AuthContext): Promise<number> {
    return this.repository.markAllNotificationsRead(context);
  }
}
