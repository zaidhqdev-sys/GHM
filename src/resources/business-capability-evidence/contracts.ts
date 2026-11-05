import type { AuthContext } from '../../auth/authorization';

export type EvidenceDecision = 'verified' | 'rejected' | 'revoked';
export type EvidenceStatus = 'pending' | 'verified' | 'rejected' | 'revoked' | 'expired';
export type EvidenceVisibility = 'private' | 'authenticated' | 'public';
export type EvidenceType = 'accreditation' | 'certification' | 'licence' | 'project_record' | 'customer_reference' | 'portfolio_reference' | 'other';

export interface BusinessCapabilityEvidence {
  readonly id: number;
  readonly businessCapabilityId: number;
  readonly businessId: number;
  readonly businessName: string;
  readonly capabilityName: string;
  readonly evidenceType: EvidenceType;
  readonly title: string;
  readonly description: string | null;
  readonly issuerName: string | null;
  readonly referenceNumber: string | null;
  readonly evidenceUrl: string | null;
  readonly issuedOn: string | null;
  readonly expiresOn: string | null;
  readonly visibility: EvidenceVisibility;
  readonly verificationStatus: EvidenceStatus;
  readonly submittedBy: number;
  readonly submittedAt: Date;
  readonly verifiedBy: number | null;
  readonly verifiedAt: Date | null;
  readonly verificationReason: string | null;
}

export interface CreateBusinessCapabilityEvidenceInput {
  readonly businessCapabilityId: number;
  readonly evidenceType: EvidenceType;
  readonly title: string;
  readonly description?: string | null;
  readonly issuerName?: string | null;
  readonly referenceNumber?: string | null;
  readonly evidenceUrl?: string | null;
  readonly issuedOn?: string | null;
  readonly expiresOn?: string | null;
  readonly visibility?: EvidenceVisibility;
}

export interface BusinessCapabilityEvidenceRepository {
  create(context: AuthContext, input: CreateBusinessCapabilityEvidenceInput): Promise<BusinessCapabilityEvidence>;
  listForBusiness(context: AuthContext, businessId: number): Promise<readonly BusinessCapabilityEvidence[]>;
  listForVerification(context: AuthContext, limit: number): Promise<readonly BusinessCapabilityEvidence[]>;
  review(context: AuthContext, evidenceId: number, decision: EvidenceDecision, reason?: string | null): Promise<BusinessCapabilityEvidence>;
}
export interface BusinessCapabilityEvidenceService extends BusinessCapabilityEvidenceRepository {}
