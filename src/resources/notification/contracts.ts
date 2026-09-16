import type { AuthContext } from '../../auth/authorization';

export type NotificationId = number;
export type AccountId = number;
export type NotificationType = 'system' | 'lead' | 'verification' | 'project' | 'quote' | 'message';

export interface Notification {
  readonly id: NotificationId;
  readonly userId: AccountId;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly metadata: Record<string, unknown>;
  readonly isRead: boolean;
  readonly readAt: Date | null;
  readonly createdAt: Date;
}

export interface CreateNotificationInput {
  readonly userId: AccountId;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly metadata?: Record<string, unknown>;
}

export interface ListNotificationsOptions {
  readonly limit?: number;
}

export interface NotificationRepository {
  createNotification(context: AuthContext, input: CreateNotificationInput): Promise<Notification>;
  getNotification(context: AuthContext, notificationId: NotificationId): Promise<Notification | null>;
  listNotifications(context: AuthContext, options?: ListNotificationsOptions): Promise<Notification[]>;
  markNotificationRead(context: AuthContext, notificationId: NotificationId): Promise<Notification>;
  markAllNotificationsRead(context: AuthContext): Promise<number>;
}

export interface NotificationService {
  createNotification(context: AuthContext, input: CreateNotificationInput): Promise<Notification>;
  getNotification(context: AuthContext, notificationId: NotificationId): Promise<Notification | null>;
  listNotifications(context: AuthContext, options?: ListNotificationsOptions): Promise<Notification[]>;
  markNotificationRead(context: AuthContext, notificationId: NotificationId): Promise<Notification>;
  markAllNotificationsRead(context: AuthContext): Promise<number>;
}

export const NOTIFICATION_OPERATIONS = Object.freeze({
  read: 'notification.read',
  create: 'notification.create',
  markRead: 'notification.markRead',
  markAllRead: 'notification.markAllRead',
});
