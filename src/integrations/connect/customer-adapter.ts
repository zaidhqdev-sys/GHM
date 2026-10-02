import type { ConnectAuthorizedOperation } from './authorization-binding';
import type { Customer, CustomerService, CreateCustomerInput, CustomerStatus } from '../../resources/customer/contracts';

export type ConnectCustomerCapability =
  | 'customer.read'
  | 'customer.create'
  | 'customer.update';

export type ConnectCustomerDispatchInput =
  | { readonly capability: 'customer.read'; readonly customerId?: number; readonly status?: CustomerStatus }
  | { readonly capability: 'customer.create'; readonly name: string; readonly phone?: string | null; readonly email?: string | null }
  | { readonly capability: 'customer.update'; readonly customerId: number; readonly status: CustomerStatus };

export type ConnectCustomerDispatchResult = Customer | Customer[] | null;

export interface ConnectCustomerAdapterDependencies {
  readonly customers: CustomerService;
}

export class ConnectCustomerAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectCustomerAdapterError';
  }
}

const assertAuthorized = (
  authorized: ConnectAuthorizedOperation,
  capability: ConnectCustomerCapability,
): void => {
  if (!authorized || authorized.capability !== capability || authorized.resource !== 'customer') {
    throw new ConnectCustomerAdapterError('Authorized customer capability does not match request');
  }
};

const assertPositiveId: (value: unknown) => asserts value is number = (value: unknown): asserts value is number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ConnectCustomerAdapterError('Invalid customer identifier');
  }
};

const toCreateInput = (input: Extract<ConnectCustomerDispatchInput, { capability: 'customer.create' }>): CreateCustomerInput => ({
  name: input.name,
  ...(input.phone !== undefined ? { phone: input.phone } : {}),
  ...(input.email !== undefined ? { email: input.email } : {}),
});

export const dispatchConnectCustomerCapability = async (
  authorized: ConnectAuthorizedOperation,
  input: ConnectCustomerDispatchInput,
  dependencies: ConnectCustomerAdapterDependencies,
): Promise<ConnectCustomerDispatchResult> => {
  switch (input.capability) {
    case 'customer.read':
      assertAuthorized(authorized, input.capability);
      if (authorized.operation !== 'read') throw new ConnectCustomerAdapterError('Authorized operation does not match capability');
      if (input.customerId === undefined) return dependencies.customers.listCustomers(authorized.context, input.status);
      assertPositiveId(input.customerId);
      return dependencies.customers.getCustomer(authorized.context, input.customerId);

    case 'customer.create':
      assertAuthorized(authorized, input.capability);
      if (authorized.operation !== 'create') throw new ConnectCustomerAdapterError('Authorized operation does not match capability');
      return dependencies.customers.createCustomer(authorized.context, toCreateInput(input));

    case 'customer.update':
      assertAuthorized(authorized, input.capability);
      if (authorized.operation !== 'update') throw new ConnectCustomerAdapterError('Authorized operation does not match capability');
      assertPositiveId(input.customerId);
      return input.status === 'archived'
        ? dependencies.customers.archiveCustomer(authorized.context, input.customerId)
        : dependencies.customers.restoreCustomer(authorized.context, input.customerId);

    default: {
      const unreachable: never = input;
      throw new ConnectCustomerAdapterError(`Unsupported Connect customer capability: ${String(unreachable)}`);
    }
  }
};
