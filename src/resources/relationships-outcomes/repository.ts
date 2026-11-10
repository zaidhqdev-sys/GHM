import type { PoolClient } from 'pg';
import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction } from '../../db/authorized-transaction';
import type { TransactionPool } from '../../db/transaction';
import type { RelationshipsOutcomesRepository } from './contracts';

const assertBusinessReadAccess = async (client: PoolClient, context: AuthContext, businessId: number): Promise<void> => {
  const result = await client.query(
    `SELECT 1 FROM ghm.business_membership
     WHERE business_id = $1 AND account_id = $2 AND membership_status = 'active'
     LIMIT 1`,
    [businessId, context.userId],
  );
  if (result.rowCount !== 1) throw new Error('Business read permission required');
};

const mapNestedId = (value: unknown): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const row = value as Record<string, unknown>;
  return { ...row, ...(row.id === undefined ? {} : { id: Number(row.id) }) };
};

const mapRelationship = (row: any): Record<string, unknown> => ({
  ...row,
  id: Number(row.id),
  relationship_type_id: Number(row.relationship_type_id),
  source_business_id: Number(row.source_business_id),
  target_business_id: Number(row.target_business_id),
  originating_opportunity_id: row.originating_opportunity_id === null ? null : Number(row.originating_opportunity_id),
  created_by: Number(row.created_by),
  relationship_type: mapNestedId(row.relationship_type),
  source_business: mapNestedId(row.source_business),
  target_business: mapNestedId(row.target_business),
});

const mapOutcome = (row: any): Record<string, unknown> => ({
  ...row,
  id: Number(row.id),
  outcome_type_id: Number(row.outcome_type_id),
  subject_business_id: row.subject_business_id === null ? null : Number(row.subject_business_id),
  counterparty_business_id: row.counterparty_business_id === null ? null : Number(row.counterparty_business_id),
  opportunity_id: row.opportunity_id === null ? null : Number(row.opportunity_id),
  business_relationship_id: row.business_relationship_id === null ? null : Number(row.business_relationship_id),
  created_by: Number(row.created_by),
  outcome_type: mapNestedId(row.outcome_type),
  relationship: mapNestedId(row.relationship),
});

export class PostgresRelationshipsOutcomesRepository implements RelationshipsOutcomesRepository {
  constructor(private readonly transactionPool?: TransactionPool) {}

  async getBusinessRelationships(context: AuthContext, businessId: number, status?: string, limit = 100): Promise<Record<string, unknown>[]> {
    return withAuthorizedTransaction(context, async client => {
      await assertBusinessReadAccess(client, context, businessId);
      const result = await client.query(
        `SELECT relationship.*,
                to_jsonb(relationship_type) AS relationship_type,
                jsonb_build_object('id', source_business.id, 'name', source_business.name, 'slug', source_business.slug) AS source_business,
                jsonb_build_object('id', target_business.id, 'name', target_business.name, 'slug', target_business.slug) AS target_business
         FROM ghm.business_relationship relationship
         JOIN ghm.relationship_type relationship_type ON relationship_type.id = relationship.relationship_type_id
         JOIN ghm.business source_business ON source_business.id = relationship.source_business_id
         JOIN ghm.business target_business ON target_business.id = relationship.target_business_id
         WHERE (relationship.source_business_id = $1 OR relationship.target_business_id = $1)
           AND ($2::text IS NULL OR relationship.lifecycle_status = $2)
         ORDER BY relationship.valid_from DESC, relationship.id DESC
         LIMIT $3`,
        [businessId, status ?? null, limit],
      );
      return result.rows.map(mapRelationship);
    }, this.transactionPool);
  }

  async getBusinessOutcomes(context: AuthContext, businessId: number, status?: string, limit = 100): Promise<Record<string, unknown>[]> {
    return withAuthorizedTransaction(context, async client => {
      await assertBusinessReadAccess(client, context, businessId);
      const result = await client.query(
        `SELECT outcome.*,
                to_jsonb(outcome_type) AS outcome_type,
                CASE WHEN relationship.id IS NULL THEN NULL ELSE to_jsonb(relationship) END AS relationship
         FROM ghm.outcome outcome
         JOIN ghm.outcome_type outcome_type ON outcome_type.id = outcome.outcome_type_id
         LEFT JOIN ghm.business_relationship relationship ON relationship.id = outcome.business_relationship_id
         WHERE (outcome.subject_business_id = $1 OR outcome.counterparty_business_id = $1)
           AND ($2::text IS NULL OR outcome.lifecycle_status = $2)
         ORDER BY outcome.occurred_at DESC, outcome.id DESC
         LIMIT $3`,
        [businessId, status ?? null, limit],
      );
      return result.rows.map(mapOutcome);
    }, this.transactionPool);
  }
}
