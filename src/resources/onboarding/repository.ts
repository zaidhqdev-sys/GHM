import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type { OnboardingProgress, OnboardingProgressRepository } from './contracts';

const COLUMNS = 'id, account_id, journey_id, step_id, status, first_started_at, completed_at, dismissed_at, created_at, updated_at';

const mapProgress = (row: any): OnboardingProgress => ({
  id: Number(row.id),
  accountId: Number(row.account_id),
  journeyId: row.journey_id,
  stepId: row.step_id,
  status: row.status,
  firstStartedAt: row.first_started_at,
  completedAt: row.completed_at,
  dismissedAt: row.dismissed_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class PostgresOnboardingProgressRepository implements OnboardingProgressRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async getProgress(context: AuthContext, journeyId?: string | null): Promise<OnboardingProgress[]> {
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `SELECT ${COLUMNS}
         FROM ghm.account_onboarding_progress
         WHERE account_id = $1 AND ($2::text IS NULL OR journey_id = $2)
         ORDER BY created_at, step_id`,
        [context.userId, journeyId ?? null],
      );
      return result.rows.map(mapProgress);
    }, this.transactionPool);
  }

  async start(context: AuthContext, journeyId: string, stepId: string): Promise<OnboardingProgress> {
    return withAuthorizedTransaction(context, async client => {
      await client.query(
        `INSERT INTO ghm.account_onboarding_progress (account_id, journey_id, step_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (account_id, journey_id, step_id) DO NOTHING`,
        [context.userId, journeyId, stepId],
      );
      const result = await client.query(
        `SELECT ${COLUMNS} FROM ghm.account_onboarding_progress
         WHERE account_id = $1 AND journey_id = $2 AND step_id = $3`,
        [context.userId, journeyId, stepId],
      );
      if (result.rowCount !== 1) throw new Error('Onboarding progress could not be loaded');
      return mapProgress(result.rows[0]);
    }, this.transactionPool);
  }

  async complete(context: AuthContext, journeyId: string, stepId: string): Promise<OnboardingProgress> {
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `INSERT INTO ghm.account_onboarding_progress
           (account_id, journey_id, step_id, status, completed_at)
         VALUES ($1, $2, $3, 'completed', now())
         ON CONFLICT (account_id, journey_id, step_id) DO UPDATE
           SET status = 'completed', completed_at = now(), dismissed_at = NULL, updated_at = now()
         RETURNING ${COLUMNS}`,
        [context.userId, journeyId, stepId],
      );
      return mapProgress(result.rows[0]);
    }, this.transactionPool);
  }

  async dismiss(context: AuthContext, journeyId: string, stepId: string): Promise<OnboardingProgress> {
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `INSERT INTO ghm.account_onboarding_progress
           (account_id, journey_id, step_id, status, dismissed_at)
         VALUES ($1, $2, $3, 'dismissed', now())
         ON CONFLICT (account_id, journey_id, step_id) DO UPDATE
           SET status = 'dismissed', dismissed_at = now(), completed_at = NULL, updated_at = now()
         RETURNING ${COLUMNS}`,
        [context.userId, journeyId, stepId],
      );
      return mapProgress(result.rows[0]);
    }, this.transactionPool);
  }
}
