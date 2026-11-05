import { requireAuthenticatedContext, type AuthContext } from '../../auth/authorization';
import type { BusinessCapabilityEvidenceRepository, BusinessCapabilityEvidenceService, CreateBusinessCapabilityEvidenceInput, EvidenceDecision, EvidenceType, EvidenceVisibility } from './contracts';

const TYPES = new Set<EvidenceType>(['accreditation','certification','licence','project_record','customer_reference','portfolio_reference','other']);
const VISIBILITY = new Set<EvidenceVisibility>(['private','authenticated','public']);
const positiveId = (value: unknown, field: string) => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${field} must be a positive integer`);
};
const optionalText = (value: unknown, field: string, max: number) => {
  if (value == null) return;
  if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > max) throw new Error(`${field} is invalid`);
};
const validDate = (value: unknown, field: string) => {
  if (value == null) return;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error(`${field} is invalid`);
};
const validateCreate = (context: AuthContext, input: CreateBusinessCapabilityEvidenceInput) => {
  requireAuthenticatedContext(context);
  if (context.role !== 'business') throw new Error('Business account required');
  if (!input || typeof input !== 'object') throw new Error('Evidence input is required');
  positiveId(input.businessCapabilityId, 'businessCapabilityId');
  if (!TYPES.has(input.evidenceType)) throw new Error('Evidence type is invalid');
  optionalText(input.title, 'Evidence title', 160);
  if (!input.title?.trim()) throw new Error('Evidence title is required');
  optionalText(input.description, 'Evidence description', 2000);
  optionalText(input.issuerName, 'Evidence issuer', 160);
  optionalText(input.referenceNumber, 'Evidence reference', 160);
  if (input.evidenceUrl != null && (typeof input.evidenceUrl !== 'string' || input.evidenceUrl.trim().length < 8 || input.evidenceUrl.trim().length > 500 || !/^https:\/\//i.test(input.evidenceUrl.trim()))) throw new Error('Evidence URL must be a bounded HTTPS URL');
  validDate(input.issuedOn, 'Issued-on date');
  validDate(input.expiresOn, 'Expires-on date');
  if (input.issuedOn && input.expiresOn && input.expiresOn <= input.issuedOn) throw new Error('Expiry date must be later than issue date');
  if (input.visibility != null && !VISIBILITY.has(input.visibility)) throw new Error('Evidence visibility is invalid');
  return input;
};

export class BusinessCapabilityEvidenceServiceImpl implements BusinessCapabilityEvidenceService {
  constructor(private readonly repository: BusinessCapabilityEvidenceRepository) {}
  async create(context: AuthContext, input: CreateBusinessCapabilityEvidenceInput) {
    return this.repository.create(context, validateCreate(context, input));
  }
  async listForBusiness(context: AuthContext, businessId: number) {
    requireAuthenticatedContext(context); positiveId(businessId, 'businessId');
    if (context.role !== 'business') throw new Error('Business access required');
    return this.repository.listForBusiness(context, businessId);
  }
  async listForVerification(context: AuthContext, limit = 100) {
    requireAuthenticatedContext(context);
    if (context.role !== 'admin') throw new Error('Capability evidence verifier authority required');
    const safeLimit = Number.isSafeInteger(limit) ? Math.min(100, Math.max(1, limit)) : 100;
    return this.repository.listForVerification(context, safeLimit);
  }
  async review(context: AuthContext, evidenceId: number, decision: EvidenceDecision, reason?: string | null) {
    requireAuthenticatedContext(context);
    if (context.role !== 'admin') throw new Error('Capability evidence verifier authority required');
    positiveId(evidenceId, 'evidenceId');
    if (!['verified','rejected','revoked'].includes(decision)) throw new Error('Evidence decision is invalid');
    if (decision !== 'verified' && (!reason?.trim() || reason.trim().length > 1000)) throw new Error('A bounded reason is required for rejection or revocation');
    return this.repository.review(context, evidenceId, decision, reason);
  }
}
