import { assertRole, requireAuthenticatedContext, type AuthContext } from '../../auth/authorization';
import type {
  BusinessId,
  ContactAccessCheckResult,
  ContactAccessEntitlement,
  ContactAccessRepository,
  ContactAccessService,
  ContactDisclosure,
  GrantContactAccessInput,
  OpportunityId,
  RevokeContactAccessInput,
} from './contracts';
import { CONTACT_ACCESS_GRANT_REASON } from './contracts';

const requirePositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value as number;
};

const normalizeSource = (value: unknown, field: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be between 1 and 100 characters`);
  }
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 100) {
    throw new Error(`${field} must be between 1 and 100 characters`);
  }
  return normalized;
};

const normalizeReason = (value: unknown, field: string, max: number): string => {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be between 1 and ${max} characters`);
  }
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > max) {
    throw new Error(`${field} must be between 1 and ${max} characters`);
  }
  return normalized;
};

const validateGrantInput = (context: AuthContext, input: GrantContactAccessInput): GrantContactAccessInput => {
  requireAuthenticatedContext(context);
  assertRole(context, 'business');
  if (!input || typeof input !== 'object') {
    throw new Error('Contact Access grant input is required');
  }
  if (input.grantReason !== CONTACT_ACCESS_GRANT_REASON.manualPromotional) {
    throw new Error('Use the verified commercial authorization path for commercial Contact Access grants');
  }
  return {
    businessId: requirePositiveId(input.businessId, 'businessId'),
    opportunityId: requirePositiveId(input.opportunityId, 'opportunityId'),
    grantReason: CONTACT_ACCESS_GRANT_REASON.manualPromotional,
    grantSource: normalizeSource(input.grantSource, 'grantSource'),
  };
};

const validateRevokeInput = (context: AuthContext, input: RevokeContactAccessInput): RevokeContactAccessInput => {
  requireAuthenticatedContext(context);
  assertRole(context, 'business');
  if (!input || typeof input !== 'object') {
    throw new Error('Contact Access revoke input is required');
  }
  return {
    businessId: requirePositiveId(input.businessId, 'businessId'),
    opportunityId: requirePositiveId(input.opportunityId, 'opportunityId'),
    revocationReason: normalizeReason(input.revocationReason, 'revocationReason', 500),
  };
};

export class ContactAccessServiceImpl implements ContactAccessService {
  constructor(private readonly repository: ContactAccessRepository) {}

  async grantContactAccess(context: AuthContext, input: GrantContactAccessInput): Promise<ContactAccessEntitlement> {
    return this.repository.grantContactAccess(context, validateGrantInput(context, input));
  }

  async getContactAccess(
    context: AuthContext,
    businessId: BusinessId,
    opportunityId: OpportunityId,
  ): Promise<ContactAccessCheckResult> {
    requireAuthenticatedContext(context);
    assertRole(context, 'business');
    return this.repository.getContactAccess(
      context,
      requirePositiveId(businessId, 'businessId'),
      requirePositiveId(opportunityId, 'opportunityId'),
    );
  }

  async revokeContactAccess(context: AuthContext, input: RevokeContactAccessInput): Promise<ContactAccessEntitlement> {
    return this.repository.revokeContactAccess(context, validateRevokeInput(context, input));
  }

  /**
   * Slice B: disclose live Enquiry contact fields when Contact Access is active.
   * Protected contacts are not available through ordinary Enquiry resource reads.
   */
  async discloseContactAccess(
    context: AuthContext,
    businessId: BusinessId,
    opportunityId: OpportunityId,
  ): Promise<ContactDisclosure> {
    requireAuthenticatedContext(context);
    assertRole(context, 'business');
    return this.repository.discloseContactAccess(
      context,
      requirePositiveId(businessId, 'businessId'),
      requirePositiveId(opportunityId, 'opportunityId'),
    );
  }
}
