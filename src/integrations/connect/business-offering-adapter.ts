import type { ConnectAuthorizedOperation } from './authorization-binding';
import type {
  BusinessOffering,
  BusinessOfferingService,
  CreateBusinessOfferingInput,
  UpdateBusinessOfferingInput,
} from '../../resources/business-offering/contracts';

export type ConnectBusinessOfferingCapability =
  | 'business_offering.read'
  | 'business_offering.create'
  | 'business_offering.update';

export type ConnectBusinessOfferingDispatchInput =
  | { readonly capability: 'business_offering.read'; readonly businessId: number; readonly activeOnly?: boolean }
  | { readonly capability: 'business_offering.create'; readonly input: CreateBusinessOfferingInput }
  | { readonly capability: 'business_offering.update'; readonly offeringId: string; readonly input: UpdateBusinessOfferingInput };

export type ConnectBusinessOfferingDispatchResult = BusinessOffering | readonly BusinessOffering[] | null;

export interface ConnectBusinessOfferingAdapterDependencies {
  readonly businessOfferings: BusinessOfferingService;
}

export class ConnectBusinessOfferingAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectBusinessOfferingAdapterError';
  }
}

const assertAuthorizedCapability: (
  authorized: ConnectAuthorizedOperation,
  capability: ConnectBusinessOfferingCapability,
) => void = (authorized, capability) => {
  if (!authorized || authorized.capability !== capability || authorized.resource !== 'business_offering') {
    throw new ConnectBusinessOfferingAdapterError('Authorized Business Offering capability does not match request');
  }
  if (authorized.operation !== capability.slice('business_offering.'.length)) {
    throw new ConnectBusinessOfferingAdapterError('Authorized operation does not match capability');
  }
  if (authorized.context.role !== 'business' && authorized.context.role !== 'admin') {
    throw new ConnectBusinessOfferingAdapterError('Business Offering access requires business or admin context');
  }
};

const assertPositiveId: (value: unknown) => asserts value is number = (value: unknown): asserts value is number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ConnectBusinessOfferingAdapterError('Invalid business identifier');
  }
};

export const dispatchConnectBusinessOfferingCapability = async (
  authorized: ConnectAuthorizedOperation,
  input: ConnectBusinessOfferingDispatchInput,
  dependencies: ConnectBusinessOfferingAdapterDependencies,
): Promise<ConnectBusinessOfferingDispatchResult> => {
  assertAuthorizedCapability(authorized, input.capability);

  switch (input.capability) {
    case 'business_offering.read':
      assertPositiveId(input.businessId);
      return dependencies.businessOfferings.listBusinessOfferings(authorized.context, {
        businessId: input.businessId,
        ...(input.activeOnly !== undefined ? { activeOnly: input.activeOnly } : {}),
      });

    case 'business_offering.create':
      assertPositiveId(input.input.businessId);
      return dependencies.businessOfferings.createBusinessOffering(authorized.context, input.input);

    case 'business_offering.update':
      if (typeof input.offeringId !== 'string' || !input.offeringId.trim()) {
        throw new ConnectBusinessOfferingAdapterError('Invalid business offering identifier');
      }
      return dependencies.businessOfferings.updateBusinessOffering(authorized.context, input.offeringId, input.input);

    default: {
      const unreachable: never = input;
      throw new ConnectBusinessOfferingAdapterError(
        `Unsupported Connect Business Offering capability: ${String(unreachable)}`,
      );
    }
  }
};
