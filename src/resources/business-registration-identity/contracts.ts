import type { AuthContext } from '../../auth/authorization';

export type BusinessRegistrationStatus = 'registered' | 'unregistered' | null;

export interface BusinessRegistrationIdentity {
  readonly businessId: number;
  /** Self-declared classification only; this is not independent verification. */
  readonly registrationStatus: BusinessRegistrationStatus;
  readonly registrationNumber: string | null;
  readonly legalName: string | null;
  readonly updatedAt: Date | null;
}

export interface UpdateBusinessRegistrationIdentityInput {
  readonly businessId: number;
  readonly registrationStatus: BusinessRegistrationStatus;
  readonly registrationNumber: string | null;
  readonly legalName: string | null;
}

export interface BusinessRegistrationIdentityRepository {
  getRegistrationIdentity(context: AuthContext, businessId: number): Promise<BusinessRegistrationIdentity>;
  updateRegistrationIdentity(context: AuthContext, input: UpdateBusinessRegistrationIdentityInput): Promise<BusinessRegistrationIdentity>;
}

export interface BusinessRegistrationIdentityService extends BusinessRegistrationIdentityRepository {}

export const BUSINESS_REGISTRATION_IDENTITY_OPERATIONS = Object.freeze({
  read: 'business_registration_identity.read',
  update: 'business_registration_identity.update',
});
