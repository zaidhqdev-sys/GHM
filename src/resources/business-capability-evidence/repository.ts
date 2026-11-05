import type { AuthContext } from '../../auth/authorization';
import { withAuthorizedTransaction, withTenantTransaction } from '../../db/authorized-transaction';
import { resolveTenantContext } from '../../auth/tenant-resolver';
import { pool } from '../../db/pool';
import type { TransactionPool } from '../../db/transaction';
import type { BusinessCapabilityEvidence, BusinessCapabilityEvidenceRepository, CreateBusinessCapabilityEvidenceInput, EvidenceDecision } from './contracts';

const COLUMNS = `e.id, e.business_capability_id, bc.business_id, b.name AS business_name, c.name AS capability_name,
 e.evidence_type, e.title, e.description, e.issuer_name, e.reference_number, e.evidence_url,
 e.issued_on, e.expires_on, e.visibility, e.verification_status, e.submitted_by, e.submitted_at,
 e.verified_by, e.verified_at, e.verification_reason`;
const mapEvidence = (r: any): BusinessCapabilityEvidence => ({
  id: Number(r.id), businessCapabilityId: Number(r.business_capability_id), businessId: Number(r.business_id),
  businessName: String(r.business_name), capabilityName: String(r.capability_name), evidenceType: r.evidence_type,
  title: r.title, description: r.description, issuerName: r.issuer_name, referenceNumber: r.reference_number,
  evidenceUrl: r.evidence_url, issuedOn: r.issued_on, expiresOn: r.expires_on, visibility: r.visibility,
  verificationStatus: r.verification_status, submittedBy: Number(r.submitted_by), submittedAt: r.submitted_at,
  verifiedBy: r.verified_by == null ? null : Number(r.verified_by), verifiedAt: r.verified_at,
  verificationReason: r.verification_reason,
});
const JOIN = `FROM ghm.business_capability_evidence e
 JOIN ghm.business_capability bc ON bc.id = e.business_capability_id
 JOIN ghm.business b ON b.id = bc.business_id
 JOIN ghm.capability c ON c.id = bc.capability_id`;

export class PostgresBusinessCapabilityEvidenceRepository implements BusinessCapabilityEvidenceRepository {
  constructor(private readonly transactionPool: TransactionPool = pool) {}

  async create(context: AuthContext, input: CreateBusinessCapabilityEvidenceInput) {
    return withAuthorizedTransaction(context, async client => {
      const assertion = await client.query(
        `SELECT business_id FROM ghm.business_capability WHERE id = $1 AND assertion_status = 'active'`,
        [input.businessCapabilityId],
      );
      if (assertion.rowCount !== 1) throw new Error('Active Business Capability assertion not found');
      const businessId = Number(assertion.rows[0].business_id);
      const tenant = await resolveTenantContext(client, context, businessId);
      if (tenant.membershipRole !== 'owner' && tenant.membershipRole !== 'administrator') {
        throw new Error('Business management permission required');
      }
      const result = await client.query(
        `INSERT INTO ghm.business_capability_evidence
         (business_capability_id,evidence_type,title,description,issuer_name,reference_number,evidence_url,issued_on,expires_on,visibility,submitted_by)
         VALUES ($1,$2,$3,NULLIF(btrim($4),''),NULLIF(btrim($5),''),NULLIF(btrim($6),''),NULLIF(btrim($7),''),$8,$9,$10,$11)
         RETURNING id`,
        [input.businessCapabilityId,input.evidenceType,input.title.trim(),input.description ?? null,input.issuerName ?? null,
         input.referenceNumber ?? null,input.evidenceUrl ?? null,input.issuedOn ?? null,input.expiresOn ?? null,input.visibility ?? 'private',context.userId],
      );
      const selected = await client.query(`SELECT ${COLUMNS} ${JOIN} WHERE e.id = $1`, [result.rows[0].id]);
      return mapEvidence(selected.rows[0]);
    }, this.transactionPool);
  }

  async listForBusiness(context: AuthContext, businessId: number) {
    return withTenantTransaction(context, businessId, async client => {
      const result = await client.query(`SELECT ${COLUMNS} ${JOIN}
        WHERE bc.business_id = $1 ORDER BY e.submitted_at ASC,e.id ASC`, [businessId]);
      return result.rows.map(mapEvidence);
    }, this.transactionPool);
  }

  async listForVerification(_context: AuthContext, limit: number) {
    return withAuthorizedTransaction(_context, async client => {
      const result = await client.query(`SELECT ${COLUMNS} ${JOIN}
        WHERE e.verification_status IN ('pending','verified')
        ORDER BY e.submitted_at ASC,e.id ASC LIMIT $1`, [limit]);
      return result.rows.map(mapEvidence);
    }, this.transactionPool);
  }

  async review(context: AuthContext, evidenceId: number, decision: EvidenceDecision, reason?: string | null) {
    return withAuthorizedTransaction(context, async client => {
      const result = await client.query(
        `SELECT * FROM ghm.transition_business_capability_evidence($1,$2,$3,$4)`,
        [evidenceId,decision,context.userId,reason ?? null],
      );
      if (result.rowCount !== 1) throw new Error('Capability evidence review failed');
      const selected = await client.query(`SELECT ${COLUMNS} ${JOIN} WHERE e.id = $1`, [evidenceId]);
      return mapEvidence(selected.rows[0]);
    }, this.transactionPool);
  }
}
