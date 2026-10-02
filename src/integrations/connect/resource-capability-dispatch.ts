import type { ConnectAuthorizedOperation } from './authorization-binding';
import type { SavedBusiness, SavedBusinessService } from '../../resources/saved-business/contracts';

export type ConnectResourceCapability =
  | 'saved_business.read'
  | 'saved_business.create'
  | 'saved_business.delete';

export type ConnectResourceDispatchInput =
  | { readonly capability: 'saved_business.read'; readonly savedBusinessId?: number }
  | { readonly capability: 'saved_business.create'; readonly businessId: number }
  | { readonly capability: 'saved_business.delete'; readonly savedBusinessId: number };

export type ConnectResourceDispatchResult = SavedBusiness | SavedBusiness[] | null | void;

export interface ConnectResourceCapabilityDependencies {
  readonly savedBusinesses: SavedBusinessService;
}

export class ConnectResourceCapabilityDispatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectResourceCapabilityDispatchError';
  }
}

const assertAuthorizedCapability = (
  authorized: ConnectAuthorizedOperation,
  capability: ConnectResourceCapability,
): void => {
  if (!authorized || authorized.capability !== capability) {
    throw new ConnectResourceCapabilityDispatchError('Authorized capability does not match requested capability');
  }
  if (authorized.resource !== 'saved_business') {
    throw new ConnectResourceCapabilityDispatchError('Capability resource is not dispatchable');
  }
}

export const dispatchConnectResourceCapability = async (
  authorized: ConnectAuthorizedOperation,
  input: ConnectResourceDispatchInput,
  dependencies: ConnectResourceCapabilityDependencies,
): Promise<ConnectResourceDispatchResult> => {
  switch (input.capability) {
    case 'saved_business.read':
      assertAuthorizedCapability(authorized, input.capability);
      if (authorized.operation !== 'read') {
        throw new ConnectResourceCapabilityDispatchError('Authorized operation does not match capability');
      }
      if (input.savedBusinessId === undefined) {
        return dependencies.savedBusinesses.listSavedBusinesses(authorized.context);
      }
      return dependencies.savedBusinesses.getSavedBusiness(authorized.context, input.savedBusinessId);

    case 'saved_business.create':
      assertAuthorizedCapability(authorized, input.capability);
      if (authorized.operation !== 'create') {
        throw new ConnectResourceCapabilityDispatchError('Authorized operation does not match capability');
      }
      return dependencies.savedBusinesses.createSavedBusiness(authorized.context, {
        businessId: input.businessId,
      });

    case 'saved_business.delete':
      assertAuthorizedCapability(authorized, input.capability);
      if (authorized.operation !== 'delete') {
        throw new ConnectResourceCapabilityDispatchError('Authorized operation does not match capability');
      }
      await dependencies.savedBusinesses.deleteSavedBusiness(authorized.context, input.savedBusinessId);
      return undefined;

    default: {
      const unreachable: never = input;
      throw new ConnectResourceCapabilityDispatchError(`Unsupported Connect capability: ${String(unreachable)}`);
    }
  }
};
