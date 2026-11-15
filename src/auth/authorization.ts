export type GhmRole = 'admin' | 'customer' | 'business';

export interface AuthContext {
  userId: number;
  role: GhmRole;
  /** Original verified bearer token; used only for authenticated Actor Gateway hops. Never log or serialize. */
  readonly actorGatewayBearerToken?: string;
}

export type Resource =
  | 'profile'
  | 'business'
  | 'business_capability'
  | 'business_capability_evidence'
  | 'business_registration_identity'
  | 'directory_review'
  | 'business_category'
  | 'business_category_assignment'
  | 'business_offering'
  | 'business_hours'
  | 'project'
  | 'project_quote'
  | 'opportunity_requirements'
  | 'customer'
  | 'enquiry'
  | 'quote'
  | 'notification'
  | 'support_request'
  | 'review'
  | 'opportunity'
  | 'opportunity_participant'
  | 'saved_business'
  | 'trust_score'
  | 'campaign'
  | 'directory'
  | 'commercial'
  | 'onboarding'
  | 'business_relationship'
  | 'outcome'
  | 'capability_catalogue';

const roleResources: Record<GhmRole, readonly Resource[]> = {
  admin: ['capability_catalogue', 'profile', 'business', 'business_capability', 'business_capability_evidence', 'business_registration_identity', 'directory_review', 'business_category', 'business_category_assignment', 'business_offering', 'business_hours', 'project', 'project_quote', 'opportunity_requirements', 'customer', 'enquiry', 'quote', 'notification', 'support_request', 'review', 'opportunity', 'opportunity_participant', 'saved_business', 'trust_score', 'campaign', 'directory', 'commercial', 'onboarding', 'business_relationship', 'outcome'],
  customer: ['profile', 'business', 'business_capability', 'business_registration_identity', 'directory_review', 'business_category', 'business_category_assignment', 'business_hours', 'project', 'project_quote', 'opportunity_requirements', 'customer', 'enquiry', 'quote', 'notification', 'support_request', 'review', 'opportunity', 'opportunity_participant', 'saved_business', 'trust_score', 'campaign', 'commercial', 'onboarding', 'business_relationship', 'outcome'],
  business: ['profile', 'business', 'business_capability', 'business_capability_evidence', 'business_registration_identity', 'directory_review', 'business_category', 'business_category_assignment', 'business_offering', 'business_hours', 'project', 'project_quote', 'opportunity_requirements', 'customer', 'enquiry', 'quote', 'notification', 'support_request', 'review', 'opportunity', 'opportunity_participant', 'saved_business', 'trust_score', 'campaign', 'commercial', 'onboarding', 'business_relationship', 'outcome'],
};

const isGhmRole = (value: unknown): value is GhmRole => value === 'admin' || value === 'customer' || value === 'business';

export const requireAuthenticatedContext = (context: AuthContext): void => {
  if (!context || !Number.isSafeInteger(context.userId) || context.userId <= 0 || !isGhmRole(context.role)) throw new Error('Authentication required');
};
export const canAccessResource = (context: AuthContext, resource: Resource): boolean => roleResources[context.role].includes(resource);
export const assertOwnership = (context: AuthContext, ownerId: number): void => { if (context.role !== 'admin' && context.userId !== ownerId) throw new Error('Resource ownership required'); };
export const assertRole = (context: AuthContext, ...allowedRoles: GhmRole[]): void => { if (!allowedRoles.includes(context.role)) throw new Error('Insufficient role'); };