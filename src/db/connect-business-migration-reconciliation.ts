export type ConnectBusinessReconciliationOutcome = 'MAPPED' | 'CREATE_REQUIRED' | 'CONFLICT' | 'BLOCKED';

export interface ConnectBusinessSourceEvidence {
  sourceBusinessId: string;
  sourceOwnerSubject: string;
  evidenceReference: string;
}
export interface ConnectBusinessTargetMapping {
  businessId: number;
  evidenceReference: string;
}
export interface ConnectOwnerTargetMapping {
  accountId: number;
  evidenceReference: string;
}
export interface ConnectBusinessReconciliationInput {
  source: ConnectBusinessSourceEvidence;
  businessMapping: ConnectBusinessTargetMapping | null;
  reviewedBusinessMapping?: ConnectBusinessTargetMapping | null;
  ownerMapping: ConnectOwnerTargetMapping | null;
  activeOwnerMembership: boolean;
}
export interface ConnectBusinessReconciliationResult {
  sourceBusinessId: string;
  outcome: ConnectBusinessReconciliationOutcome;
  targetBusinessId: number | null;
  targetOwnerAccountId: number | null;
  reasonCode: string;
}

const validPositiveId = (value: number): boolean => Number.isSafeInteger(value) && value > 0;

/**
 * Read-only reconciliation decision. This function never creates, links, or mutates records.
 * Exact provider IDs plus reviewed evidence are required; names/emails are intentionally absent.
 */
export function reconcileConnectBusiness(input: ConnectBusinessReconciliationInput): ConnectBusinessReconciliationResult {
  const sourceBusinessId = input.source?.sourceBusinessId?.trim() ?? '';
  const sourceOwnerSubject = input.source?.sourceOwnerSubject?.trim() ?? '';
  const evidenceReference = input.source?.evidenceReference?.trim() ?? '';
  const result = (outcome: ConnectBusinessReconciliationOutcome, reasonCode: string, businessId: number | null = null, accountId: number | null = null) =>
    ({ sourceBusinessId, outcome, targetBusinessId: businessId, targetOwnerAccountId: accountId, reasonCode });

  if (!sourceBusinessId || !sourceOwnerSubject || !evidenceReference) {
    return result('BLOCKED', 'SOURCE_BUSINESS_OWNER_AND_EVIDENCE_REQUIRED');
  }
  const exactBusiness = input.businessMapping;
  const reviewed = input.reviewedBusinessMapping;
  if (exactBusiness && (!validPositiveId(exactBusiness.businessId) || !exactBusiness.evidenceReference?.trim())) {
    return result('BLOCKED', 'CANONICAL_BUSINESS_MAPPING_EVIDENCE_REQUIRED');
  }
  if (reviewed && (!validPositiveId(reviewed.businessId) || !reviewed.evidenceReference?.trim())) {
    return result('BLOCKED', 'REVIEWED_BUSINESS_MAPPING_EVIDENCE_REQUIRED');
  }
  if (exactBusiness && reviewed && (reviewed.businessId !== exactBusiness.businessId || reviewed.evidenceReference !== evidenceReference)) {
    return result('CONFLICT', 'BUSINESS_MAPPING_REVIEW_CONFLICT', exactBusiness.businessId);
  }
  if (!exactBusiness && !reviewed) {
    return result('CREATE_REQUIRED', 'NO_EXACT_CANONICAL_BUSINESS_MAPPING');
  }
  if (!exactBusiness && reviewed && reviewed.evidenceReference !== evidenceReference) {
    return result('CONFLICT', 'BUSINESS_MAPPING_REVIEW_CONFLICT', reviewed.businessId);
  }
  const business = exactBusiness ?? reviewed!;
  const owner = input.ownerMapping;
  if (!owner) return result('BLOCKED', 'EXPLICIT_CANONICAL_OWNER_MAPPING_REQUIRED', business.businessId);
  if (!validPositiveId(owner.accountId) || !owner.evidenceReference?.trim()) {
    return result('BLOCKED', 'CANONICAL_OWNER_MAPPING_EVIDENCE_REQUIRED', business.businessId);
  }
  if (owner.evidenceReference !== evidenceReference) {
    return result('CONFLICT', 'OWNER_MAPPING_EVIDENCE_CONFLICT', business.businessId, owner.accountId);
  }
  if (!input.activeOwnerMembership) {
    return result('BLOCKED', 'ACTIVE_OWNER_MEMBERSHIP_NOT_PROVEN', business.businessId, owner.accountId);
  }
  return result('MAPPED', 'EXACT_BUSINESS_OWNER_AND_ACTIVE_MEMBERSHIP', business.businessId, owner.accountId);
}
