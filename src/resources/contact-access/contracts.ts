import type { AuthContext } from '../../auth/authorization';

export type ContactAccessEntitlementId = number;
export type BusinessId = number;
export type OpportunityId = number;
export type AccountId = number;

/** Slice A authorization vocabulary. */
export type ContactAccessAuthorizationStatus = 'active' | 'revoked';

/** Check outcome includes absence (no entitlement history for the pair). */
export type ContactAccessCheckStatus = 'active' | 'revoked' | 'absent';

/** Slice A manual grant; Slice D verified commercial authorization grant. */
export type ContactAccessGrantReason = 'manual_promotional' | 'verified_commercial';

export interface ContactAccessEntitlement {
  readonly id: ContactAccessEntitlementId;
  readonly businessId: BusinessId;
  readonly opportunityId: OpportunityId;
  readonly authorizationStatus: ContactAccessAuthorizationStatus;
  readonly grantReason: ContactAccessGrantReason;
  readonly grantSource: string;
  readonly grantedByAccountId: AccountId | null;
  readonly grantedAt: Date;
  readonly commercialEventReference: string | null;
  readonly commercialFactId: number | null;
  readonly revokedAt: Date | null;
  readonly revokedByAccountId: AccountId | null;
  readonly revocationReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ContactAccessCheckResult {
  readonly businessId: BusinessId;
  readonly opportunityId: OpportunityId;
  readonly status: ContactAccessCheckStatus;
  readonly entitlement: ContactAccessEntitlement | null;
}

export interface GrantContactAccessInput {
  readonly businessId: BusinessId;
  readonly opportunityId: OpportunityId;
  readonly grantReason: ContactAccessGrantReason;
  readonly grantSource: string;
}

export interface RevokeContactAccessInput {
  readonly businessId: BusinessId;
  readonly opportunityId: OpportunityId;
  readonly revocationReason: string;
}

/**
 * Slice B disclosure payload. Live Enquiry contact fields only.
 * Never includes customerId, creatorAccountId, or entitlement internals.
 */
export interface ContactDisclosure {
  readonly customerName: string;
  readonly customerPhone: string | null;
  readonly customerEmail: string | null;
}

export interface ContactAccessRepository {
  grantContactAccess(context: AuthContext, input: GrantContactAccessInput): Promise<ContactAccessEntitlement>;
  getContactAccess(
    context: AuthContext,
    businessId: BusinessId,
    opportunityId: OpportunityId,
  ): Promise<ContactAccessCheckResult>;
  revokeContactAccess(context: AuthContext, input: RevokeContactAccessInput): Promise<ContactAccessEntitlement>;
  /**
   * Disclose live Enquiry contact fields only when Contact Access is active
   * for the exact (businessId, opportunityId). Membership alone is insufficient.
   */
  discloseContactAccess(
    context: AuthContext,
    businessId: BusinessId,
    opportunityId: OpportunityId,
  ): Promise<ContactDisclosure>;
}

export interface ContactAccessService {
  grantContactAccess(context: AuthContext, input: GrantContactAccessInput): Promise<ContactAccessEntitlement>;
  getContactAccess(
    context: AuthContext,
    businessId: BusinessId,
    opportunityId: OpportunityId,
  ): Promise<ContactAccessCheckResult>;
  revokeContactAccess(context: AuthContext, input: RevokeContactAccessInput): Promise<ContactAccessEntitlement>;
  discloseContactAccess(
    context: AuthContext,
    businessId: BusinessId,
    opportunityId: OpportunityId,
  ): Promise<ContactDisclosure>;
}

export const CONTACT_ACCESS_GRANT_REASON = Object.freeze({
  manualPromotional: 'manual_promotional' as const,
  verifiedCommercial: 'verified_commercial' as const,
});
