import { requireAuthenticatedContext, type AuthContext } from '../../auth/authorization';
import type {
  BusinessRegistrationIdentity,
  BusinessRegistrationIdentityRepository,
  BusinessRegistrationIdentityService,
  UpdateBusinessRegistrationIdentityInput,
} from './contracts';

const requirePositiveId = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error('businessId must be a positive integer');
  }
  return value as number;
};

const validateInput = (context: AuthContext, input: UpdateBusinessRegistrationIdentityInput): UpdateBusinessRegistrationIdentityInput => {
  requireAuthenticatedContext(context);
  if (!input || typeof input !== 'object') throw new Error('Business registration identity input is required');
  requirePositiveId(input.businessId);
  if (input.registrationStatus !== null && input.registrationStatus !== 'registered' && input.registrationStatus !== 'unregistered') {
    throw new Error('Registration status must be registered, unregistered, or null');
  }

  const registrationNumber = input.registrationNumber;
  const legalName = input.legalName;
  if (registrationNumber !== null && typeof registrationNumber !== 'string') {
    throw new Error('Registration number must be text or null');
  }
  if (legalName !== null && typeof legalName !== 'string') {
    throw new Error('Legal name must be text or null');
  }

  if (input.registrationStatus === 'registered') {
    const normalizedNumber = String(registrationNumber ?? '').trim();
    const normalizedLegalName = String(legalName ?? '').trim();
    if (normalizedNumber.length < 1 || normalizedNumber.length > 120) {
      throw new Error('Registration number must contain between 1 and 120 characters');
    }
    if (normalizedLegalName.length < 1 || normalizedLegalName.length > 200) {
      throw new Error('Legal name must contain between 1 and 200 characters');
    }
    return {
      businessId: input.businessId,
      registrationStatus: input.registrationStatus,
      registrationNumber: normalizedNumber,
      legalName: normalizedLegalName,
    };
  }

  if (registrationNumber !== null || legalName !== null) {
    throw new Error('Registration fields must be empty unless the Business is registered');
  }
  return {
    businessId: input.businessId,
    registrationStatus: input.registrationStatus,
    registrationNumber: null,
    legalName: null,
  };
};

export class BusinessRegistrationIdentityServiceImpl implements BusinessRegistrationIdentityService {
  constructor(private readonly repository: BusinessRegistrationIdentityRepository) {}

  async getRegistrationIdentity(context: AuthContext, businessId: number): Promise<BusinessRegistrationIdentity> {
    requireAuthenticatedContext(context);
    requirePositiveId(businessId);
    return this.repository.getRegistrationIdentity(context, businessId);
  }

  async updateRegistrationIdentity(context: AuthContext, input: UpdateBusinessRegistrationIdentityInput): Promise<BusinessRegistrationIdentity> {
    return this.repository.updateRegistrationIdentity(context, validateInput(context, input));
  }
}
