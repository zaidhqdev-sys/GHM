import type { AuthContext } from '../../auth/authorization';
import type { VerifiedQuoteFlowIdentityLinkAttestation } from './identity-link-attestation';

export type QuoteFlowIdentityLinkKind = 'account' | 'business';

export interface GhmAccountConfirmation {
  readonly kind: 'account';
  readonly actorUserId: number;
}

export interface GhmBusinessConfirmation {
  readonly kind: 'business';
  readonly actorUserId: number;
  readonly businessId: number;
}

export type GhmIdentityLinkConfirmation = GhmAccountConfirmation | GhmBusinessConfirmation;

export interface QuoteFlowBusinessConfirmation {
  readonly kind: 'business';
  readonly organizationId: string;
}

export interface ActiveAccountLink {
  readonly quoteFlowIdentityId: string;
  readonly ghmAccountId: number;
}

export interface ActiveBusinessLink {
  readonly quoteFlowOrganizationId: string;
  readonly ghmBusinessId: number;
}

export type IdentityLinkDecision =
  | { readonly outcome: 'eligible'; readonly kind: 'account'; readonly quoteFlowIdentityId: string; readonly ghmAccountId: number }
  | { readonly outcome: 'eligible'; readonly kind: 'business'; readonly quoteFlowOrganizationId: string; readonly ghmBusinessId: number }
  | { readonly outcome: 'reject'; readonly reason:
      | 'missing-ghm-confirmation'
      | 'confirmation-kind-mismatch'
      | 'account-principal-mismatch'
      | 'business-organization-missing'
      | 'account-link-conflict'
      | 'business-link-conflict'
      | 'invalid-ghm-context'
    };

const positiveSafeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const assertGhmContext = (context: AuthContext): void => {
  if (!context || !positiveSafeInteger(context.userId)) {
    throw new Error('Authentication required');
  }
};

export const createGhmAccountConfirmation = (context: AuthContext): GhmAccountConfirmation => {
  assertGhmContext(context);
  return { kind: 'account', actorUserId: context.userId };
};

export const createGhmBusinessConfirmation = (
  context: AuthContext,
  resolvedBusinessId: number,
): GhmBusinessConfirmation => {
  assertGhmContext(context);
  if (!positiveSafeInteger(resolvedBusinessId)) {
    throw new Error('Authorized GHM Business is required');
  }
  return { kind: 'business', actorUserId: context.userId, businessId: resolvedBusinessId };
};

export const decideQuoteFlowAccountLink = (
  attestation: VerifiedQuoteFlowIdentityLinkAttestation,
  confirmation: GhmIdentityLinkConfirmation | null,
  activeLinks: readonly ActiveAccountLink[],
): IdentityLinkDecision => {
  if (!confirmation) return { outcome: 'reject', reason: 'missing-ghm-confirmation' };
  if (confirmation.kind !== 'account') return { outcome: 'reject', reason: 'confirmation-kind-mismatch' };

  const ghmAccountId = confirmation.actorUserId;
  if (!positiveSafeInteger(ghmAccountId)) {
    return { outcome: 'reject', reason: 'account-principal-mismatch' };
  }

  if (activeLinks.some(
    link => link.quoteFlowIdentityId === attestation.claims.sub || link.ghmAccountId === ghmAccountId,
  )) {
    const identical = activeLinks.some(
      link => link.quoteFlowIdentityId === attestation.claims.sub && link.ghmAccountId === ghmAccountId,
    );
    return identical
      ? { outcome: 'eligible', kind: 'account', quoteFlowIdentityId: attestation.claims.sub, ghmAccountId }
      : { outcome: 'reject', reason: 'account-link-conflict' };
  }

  return { outcome: 'eligible', kind: 'account', quoteFlowIdentityId: attestation.claims.sub, ghmAccountId };
};

export const decideQuoteFlowBusinessLink = (
  organizationId: string,
  confirmation: GhmIdentityLinkConfirmation | null,
  activeLinks: readonly ActiveBusinessLink[],
): IdentityLinkDecision => {
  if (!organizationId.trim()) return { outcome: 'reject', reason: 'business-organization-missing' };
  if (!confirmation) return { outcome: 'reject', reason: 'missing-ghm-confirmation' };
  if (confirmation.kind !== 'business') return { outcome: 'reject', reason: 'confirmation-kind-mismatch' };

  const conflicting = activeLinks.some(
    link => link.quoteFlowOrganizationId === organizationId || link.ghmBusinessId === confirmation.businessId,
  );
  if (conflicting) {
    const identical = activeLinks.some(
      link => link.quoteFlowOrganizationId === organizationId && link.ghmBusinessId === confirmation.businessId,
    );
    return identical
      ? { outcome: 'eligible', kind: 'business', quoteFlowOrganizationId: organizationId, ghmBusinessId: confirmation.businessId }
      : { outcome: 'reject', reason: 'business-link-conflict' };
  }

  return {
    outcome: 'eligible',
    kind: 'business',
    quoteFlowOrganizationId: organizationId,
    ghmBusinessId: confirmation.businessId,
  };
};
