import type { AuthContext } from '../../auth/authorization';
import type {
  BusinessId,
  ContactAccessEntitlement,
  OpportunityId,
} from '../contact-access/contracts';

export type ContactAccessCommercialFactId = number;

/**
 * Verified GHM commercial authorization fact for Model A Contact Access.
 * Provider-neutral; not a payment row and not ghm.commercial_event.
 */
export interface ContactAccessCommercialFact {
  readonly id: ContactAccessCommercialFactId;
  readonly businessId: BusinessId;
  readonly opportunityId: OpportunityId;
  readonly idempotencyKey: string;
  readonly verificationStatus: 'verified';
  readonly commercialSource: string;
  readonly verifiedByAccountId: number | null;
  readonly verifiedAt: Date;
  readonly createdAt: Date;
}

export interface AuthorizeContactAccessCommercialInput {
  readonly businessId: BusinessId;
  readonly opportunityId: OpportunityId;
  readonly idempotencyKey: string;
  readonly commercialSource: string;
}

export interface ContactAccessCommercialGrantResult {
  readonly commercialFact: ContactAccessCommercialFact;
  readonly entitlement: ContactAccessEntitlement;
}

export interface ContactAccessCommercialRepository {
  /**
   * Records a verified commercial fact and grants Contact Access atomically
   * via governed database function. Idempotent on idempotencyKey.
   */
  authorizeContactAccessFromVerifiedCommercial(
    context: AuthContext,
    input: AuthorizeContactAccessCommercialInput,
  ): Promise<ContactAccessCommercialGrantResult>;
}

export interface ContactAccessCommercialService {
  authorizeContactAccessFromVerifiedCommercial(
    context: AuthContext,
    input: AuthorizeContactAccessCommercialInput,
  ): Promise<ContactAccessCommercialGrantResult>;
}

export const CONTACT_ACCESS_COMMERCIAL_VERIFICATION_STATUS = Object.freeze({
  verified: 'verified' as const,
});

export const CONTACT_ACCESS_COMMERCIAL_FACT_REFERENCE_PREFIX = 'contact_access_commercial_fact:';
