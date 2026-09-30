import type { AuthContext } from '../../auth/authorization';

export type BusinessHoursId = number;
export type BusinessId = number;
export type AccountId = number;

export interface BusinessHours {
  readonly id: BusinessHoursId;
  readonly businessId: BusinessId;
  readonly dayOfWeek: number;
  readonly isClosed: boolean;
  readonly openTime: string | null;
  readonly closeTime: string | null;
  readonly createdBy: AccountId | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BusinessHoursEntryInput {
  readonly dayOfWeek: number;
  readonly isClosed: boolean;
  readonly openTime?: string | null;
  readonly closeTime?: string | null;
}

export interface ReplaceBusinessHoursInput {
  readonly businessId: BusinessId;
  readonly hours: readonly BusinessHoursEntryInput[];
}

export interface BusinessHoursRepository {
  getBusinessHours(context: AuthContext, businessId: BusinessId): Promise<BusinessHours[]>;
  getPublicBusinessHours(context: AuthContext, businessId: BusinessId): Promise<BusinessHours[]>;
  replaceBusinessHours(context: AuthContext, input: ReplaceBusinessHoursInput): Promise<BusinessHours[]>;
}

export interface BusinessHoursService extends BusinessHoursRepository {}

export const BUSINESS_HOURS_OPERATIONS = Object.freeze({
  read: 'business_hours.read',
  readPublic: 'business_hours.readPublic',
  replace: 'business_hours.replace',
});
