export type GhmRole = 'admin' | 'customer' | 'business';

export interface AuthContext {
  userId: number;
  role: GhmRole;
}

export type Resource =
  | 'profile'
  | 'business'
  | 'project'
  | 'quote'
  | 'notification'
  | 'support_request';

const roleResources: Record<GhmRole, readonly Resource[]> = {
  admin: ['profile', 'business', 'project', 'quote', 'notification', 'support_request'],
  customer: ['profile', 'business', 'project', 'quote', 'notification', 'support_request'],
  business: ['profile', 'business', 'project', 'quote', 'notification', 'support_request'],
};

export const canAccessResource = (context: AuthContext, resource: Resource): boolean =>
  roleResources[context.role].includes(resource);

export const assertOwnership = (context: AuthContext, ownerId: number): void => {
  if (context.role !== 'admin' && context.userId !== ownerId) {
    throw new Error('Resource ownership required');
  }
};

export const assertRole = (context: AuthContext, ...allowedRoles: GhmRole[]): void => {
  if (!allowedRoles.includes(context.role)) {
    throw new Error('Insufficient role');
  }
};
