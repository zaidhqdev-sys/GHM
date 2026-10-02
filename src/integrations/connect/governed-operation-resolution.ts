import type { Resource } from '../../auth/authorization';
import { isRegisteredOperation, type ResourceOperation } from '../../resources/registry';
import type { ConnectTrustedRequestContext } from './trusted-request-context';

export interface ConnectGovernedOperation {
  readonly resource: Resource;
  readonly operation: ResourceOperation;
  readonly capability: string;
}

export class ConnectGovernedOperationResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectGovernedOperationResolutionError';
  }
}

/**
 * Resolves only operations already admitted by the canonical GHM resource
 * registry. This is a naming/governance boundary, not authorization and not
 * resource execution.
 */
export const resolveConnectGovernedOperation = (
  context: ConnectTrustedRequestContext,
): ConnectGovernedOperation => {
  if (!context || typeof context !== 'object' || !context.request) {
    throw new ConnectGovernedOperationResolutionError('Trusted Connect request context is required');
  }

  const { resource, operation } = context.request.operation;
  if (!isRegisteredOperation(resource, operation)) {
    throw new ConnectGovernedOperationResolutionError('Requested operation is not registered');
  }

  return Object.freeze({
    resource,
    operation,
    capability: resource + '.' + operation,
  });
};
