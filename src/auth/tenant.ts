export type TenantMembershipRole = 'owner' | 'administrator' | 'member';

export interface TenantContext {
  readonly businessId: number;
  readonly accountId: number;
  readonly membershipId: number;
  readonly membershipRole: TenantMembershipRole;
}

export const assertTenantContext = (context: { userId: number }, tenant: TenantContext, businessId: number): void => {
  if (tenant.accountId !== context.userId || tenant.businessId !== businessId) {
    throw new Error('Business tenant context mismatch');
  }
};
