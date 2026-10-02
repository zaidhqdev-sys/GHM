import type { AuthContext, Resource } from '../../auth/authorization';
import { canAccessResource, requireAuthenticatedContext } from '../../auth/authorization';
import type { AccountAuthStateStore } from '../../auth/ghm-bearer';
import type { ConnectIdentityAdapter } from './identity-adapter';
import type { ConnectGovernedOperation } from './governed-operation-resolution';
import type { ConnectTrustedRequestContext } from './trusted-request-context';

export interface ConnectAuthorizedOperation {
  readonly capability: string;
  readonly resource: Resource;
  readonly operation: ConnectGovernedOperation['operation'];
  readonly context: AuthContext;
}

export class ConnectAuthorizationBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectAuthorizationBindingError';
  }
}

/**
 * Binds a trusted Connect request to a current GHM account authorization
 * context. The integration principal never becomes the end-user principal.
 *
 * This is authorization only: it does not execute a resource operation.
 * Identity bootstrap is deliberately unavailable here.
 */
export const bindConnectAuthorization = async (
  request: ConnectTrustedRequestContext,
  operation: ConnectGovernedOperation,
  dependencies: {
    readonly identity: ConnectIdentityAdapter;
    readonly accounts: AccountAuthStateStore;
  },
): Promise<ConnectAuthorizedOperation> => {
  if (!request || !request.request || !request.principal) {
    throw new ConnectAuthorizationBindingError('Trusted Connect request context is required');
  }
  if (!operation || operation.resource !== request.request.operation.resource ||
      operation.operation !== request.request.operation.operation) {
    throw new ConnectAuthorizationBindingError('Governed operation does not match request');
  }

  const externalIdentity = request.request.externalIdentity;
  if (!externalIdentity || externalIdentity.provider !== 'supabase') {
    throw new ConnectAuthorizationBindingError('End-user identity is required');
  }

  const resolution = await dependencies.identity.resolve(externalIdentity.subject, {
    allowBootstrap: false,
  });
  if (resolution.outcome !== 'resolved') {
    throw new ConnectAuthorizationBindingError('Connect identity is not mapped');
  }
  if (resolution.mapping.provider !== externalIdentity.provider ||
      resolution.mapping.subject !== externalIdentity.subject) {
    throw new ConnectAuthorizationBindingError('Connect identity mapping is inconsistent');
  }

  const state = await dependencies.accounts.getAccountAuthState(resolution.mapping.accountId);
  if (!state || state.accountStatus !== 'active') {
    throw new ConnectAuthorizationBindingError('Connect identity is not active');
  }

  const role = state.isSystemAdmin ? 'admin' : state.role;
  const context = Object.freeze({ userId: state.accountId, role });
  requireAuthenticatedContext(context);

  if (!canAccessResource(context, operation.resource)) {
    throw new ConnectAuthorizationBindingError('Insufficient resource authorization');
  }

  return Object.freeze({
    capability: operation.capability,
    resource: operation.resource,
    operation: operation.operation,
    context,
  });
};
