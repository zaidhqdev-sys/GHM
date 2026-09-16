import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type {
  CreateNotificationInput,
  Notification,
  NotificationId,
  NotificationRepository,
  ListNotificationsOptions,
} from './contracts';

const NOTIFICATION_COLUMNS = `id, user_id, type, title, body, metadata, is_read, read_at, created_at`;

const mapNotification = (row: any): Notification => ({
  id: Number(row.id),
  userId: Number(row.user_id),
  type: row.type,
  title: row.title,
  body: row.body,
  metadata: row.metadata,
  isRead: row.is_read,
  readAt: row.read_at,
  createdAt: row.created_at,
});

const assertPositiveId = (id: number, field: string): void => {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Invalid ${field}`);
};

const getOwnedNotificationInTransaction = async (
  client: PoolClient,
  context: AuthContext,
  notificationId: NotificationId,
): Promise<Notification | null> => {
  const result = await client.query(
    `SELECT ${NOTIFICATION_COLUMNS}
       FROM ghm.notification
      WHERE id = $1 AND user_id = $2`,
    [notificationId, context.userId],
  );
  return result.rowCount === 1 ? mapNotification(result.rows[0]) : null;
};

export class PostgresNotificationRepository implements NotificationRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async createNotification(context: AuthContext, input: CreateNotificationInput): Promise<Notification> {
    return withAuthorizedTransaction(context, async client => {
      const recipient = await client.query(
        `SELECT 1 FROM ghm.account_identity WHERE id = $1 LIMIT 1`,
        [input.userId],
      );
      if (recipient.rowCount !== 1) throw new Error('Notification recipient not found');

      if (input.type === 'lead' && context.role !== 'admin' && input.userId !== context.userId) {
        throw new Error('Lead notification identity mapping is not established');
      }

      const result = await client.query(
        `INSERT INTO ghm.notification (user_id, type, title, body, metadata)
         VALUES ($1,$2,$3,$4,$5::jsonb)
         RETURNING ${NOTIFICATION_COLUMNS}`,
        [input.userId, input.type, input.title, input.body, JSON.stringify(input.metadata ?? {})],
      );
      return mapNotification(result.rows[0]);
    }, this.transactionPool);
  }

  async getNotification(context: AuthContext, notificationId: NotificationId): Promise<Notification | null> {
    assertPositiveId(notificationId, 'notificationId');
    return withAuthorizedTransaction(
      context,
      client => getOwnedNotificationInTransaction(client, context, notificationId),
      this.transactionPool,
    );
  }

  async listNotifications(context: AuthContext, options: ListNotificationsOptions = {}): Promise<Notification[]> {
    const limit = options.limit ?? 30;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid notification limit');

    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `SELECT ${NOTIFICATION_COLUMNS}
           FROM ghm.notification
          WHERE user_id = $1
          ORDER BY created_at DESC, id DESC
          LIMIT $2`,
        [context.userId, limit],
      );
      return result.rows.map(mapNotification);
    }, this.transactionPool);
  }

  async markNotificationRead(context: AuthContext, notificationId: NotificationId): Promise<Notification> {
    assertPositiveId(notificationId, 'notificationId');
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `UPDATE ghm.notification
            SET is_read = true,
                read_at = COALESCE(read_at, now())
          WHERE id = $1 AND user_id = $2
          RETURNING ${NOTIFICATION_COLUMNS}`,
        [notificationId, context.userId],
      );
      if (result.rowCount !== 1) throw new Error('Notification not found');
      return mapNotification(result.rows[0]);
    }, this.transactionPool);
  }

  async markAllNotificationsRead(context: AuthContext): Promise<number> {
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `UPDATE ghm.notification
            SET is_read = true,
                read_at = COALESCE(read_at, now())
          WHERE user_id = $1 AND is_read = false`,
        [context.userId],
      );
      return result.rowCount ?? 0;
    }, this.transactionPool);
  }
}
