import type { ConnectAuthorizedOperation } from './authorization-binding';
import type { BusinessCapability, BusinessCapabilityService } from '../../resources/business-capability/contracts';

export type ConnectBusinessCapabilityCapability = 'business_capability.read';

export type ConnectBusinessCapabilityDispatchInput = {
  readonly capability: 'business_capability.read';
  readonly businessId: number;
};

export interface ConnectBusinessCapabilityAdapterDependencies {
  readonly businessCapabilities: BusinessCapabilityService;
}

export class ConnectBusinessCapabilityAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectBusinessCapabilityAdapterError';
  }
}

const assertAuthorizedCapability = (
  authorized: ConnectAuthorizedOperation,
  capability: ConnectBusinessCapabilityCapability,
): void => {
  if (!authorized || authorized.capability !== capability || authorized.resource !== 'business_capability') {
    throw new ConnectBusinessCapabilityAdapterError(
      'Authorized Business Capability capability does not match request',
    );
  }
  if (authorized.operation !== 'read') {
    throw new ConnectBusinessCapabilityAdapterError('Authorized operation does not match capability');
  }
};

const assertPositiveId: (value: unknown) => asserts value is number = (value: unknown) => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ConnectBusinessCapabilityAdapterError('Invalid business identifier');
  }
};

export const dispatchConnectBusinessCapability = async (
  authorized: ConnectAuthorizedOperation,
  input: ConnectBusinessCapabilityDispatchInput,
  dependencies: ConnectBusinessCapabilityAdapterDependencies,
): Promise<BusinessCapability[]> => {
  assertAuthorizedCapability(authorized, input.capability);
  assertPositiveId(input.businessId);

  return dependencies.businessCapabilities.listBusinessCapabilities(
    authorized.context,
    input.businessId,
  );
};
