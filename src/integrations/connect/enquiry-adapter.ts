import type { ConnectAuthorizedOperation } from './authorization-binding';
import type {
  CreateEnquiryInput,
  Enquiry,
  EnquiryService,
  EnquiryStatus,
} from '../../resources/enquiry/contracts';

export type ConnectEnquiryCapability = 'enquiry.read' | 'enquiry.create' | 'enquiry.update';

export type ConnectEnquiryDispatchInput =
  | { readonly capability: 'enquiry.read'; readonly enquiryId?: number; readonly businessId?: number }
  | { readonly capability: 'enquiry.create'; readonly input: CreateEnquiryInput }
  | { readonly capability: 'enquiry.update'; readonly enquiryId: number; readonly status: EnquiryStatus };

export type ConnectEnquiryDispatchResult = Enquiry | readonly Enquiry[] | null;

export interface ConnectEnquiryAdapterDependencies {
  readonly enquiries: EnquiryService;
}

export class ConnectEnquiryAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectEnquiryAdapterError';
  }
}

const assertAuthorized = (
  authorized: ConnectAuthorizedOperation,
  capability: ConnectEnquiryCapability,
): void => {
  if (!authorized || authorized.capability !== capability || authorized.resource !== 'enquiry') {
    throw new ConnectEnquiryAdapterError('Authorized enquiry capability does not match request');
  }
  if (authorized.operation !== capability.slice('enquiry.'.length)) {
    throw new ConnectEnquiryAdapterError('Authorized operation does not match capability');
  }
};

const assertPositiveId: (value: unknown, label: string) => asserts value is number =
  (value, label) => {
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
      throw new ConnectEnquiryAdapterError(`Invalid ${label}`);
    }
  };

export const dispatchConnectEnquiryCapability = async (
  authorized: ConnectAuthorizedOperation,
  input: ConnectEnquiryDispatchInput,
  dependencies: ConnectEnquiryAdapterDependencies,
): Promise<ConnectEnquiryDispatchResult> => {
  assertAuthorized(authorized, input.capability);

  switch (input.capability) {
    case 'enquiry.read':
      if (authorized.context.role === 'customer') {
        if (input.enquiryId === undefined) {
          throw new ConnectEnquiryAdapterError('Customer enquiry read requires enquiryId');
        }
        assertPositiveId(input.enquiryId, 'enquiry identifier');
        return dependencies.enquiries.getOwnEnquiry(authorized.context, input.enquiryId);
      }
      if (authorized.context.role === 'business') {
        if (input.enquiryId !== undefined) {
          assertPositiveId(input.enquiryId, 'enquiry identifier');
          return dependencies.enquiries.getReceivedEnquiry(authorized.context, input.enquiryId);
        }
        if (input.businessId === undefined) {
          throw new ConnectEnquiryAdapterError('Business enquiry read requires businessId or enquiryId');
        }
        assertPositiveId(input.businessId, 'business identifier');
        return dependencies.enquiries.getReceivedEnquiries(authorized.context, input.businessId);
      }
      throw new ConnectEnquiryAdapterError('Enquiry read is not available for this role');

    case 'enquiry.create':
      if (authorized.context.role !== 'customer') {
        throw new ConnectEnquiryAdapterError('Enquiry creation requires customer context');
      }
      return dependencies.enquiries.createEnquiry(authorized.context, input.input);

    case 'enquiry.update':
      if (authorized.context.role !== 'business') {
        throw new ConnectEnquiryAdapterError('Enquiry update requires business context');
      }
      assertPositiveId(input.enquiryId, 'enquiry identifier');
      return dependencies.enquiries.updateReceivedEnquiryStatus(
        authorized.context,
        input.enquiryId,
        { status: input.status },
      );

    default: {
      const unreachable: never = input;
      throw new ConnectEnquiryAdapterError(`Unsupported Connect enquiry capability: ${String(unreachable)}`);
    }
  }
};
