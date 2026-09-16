import { requireAuthenticatedContext, type AuthContext } from '../../auth/authorization';
import type {
  BusinessHours,
  BusinessHoursRepository,
  BusinessHoursService,
  ReplaceBusinessHoursInput,
} from './contracts';

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

const requirePositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value as number;
};

const validateEntry = (entry: any, index: number): void => {
  if (!entry || typeof entry !== 'object') throw new Error(`Business Hours entry ${index} is invalid`);
  if (!Number.isInteger(entry.dayOfWeek) || entry.dayOfWeek < 0 || entry.dayOfWeek > 6) {
    throw new Error(`Business Hours entry ${index} has an invalid day`);
  }
  if (typeof entry.isClosed !== 'boolean') throw new Error(`Business Hours entry ${index} has an invalid closed state`);
  if (entry.isClosed) {
    if (entry.openTime != null || entry.closeTime != null) throw new Error(`Closed Business Hours entry ${index} cannot contain times`);
    return;
  }
  if (typeof entry.openTime !== 'string' || typeof entry.closeTime !== 'string' || !TIME_RE.test(entry.openTime) || !TIME_RE.test(entry.closeTime)) {
    throw new Error(`Open Business Hours entry ${index} requires valid times`);
  }
  if (entry.openTime >= entry.closeTime) throw new Error(`Business Hours entry ${index} must close after opening`);
};

const validateReplace = (context: AuthContext, input: ReplaceBusinessHoursInput): ReplaceBusinessHoursInput => {
  requireAuthenticatedContext(context);
  if (!input || typeof input !== 'object') throw new Error('Business Hours input is required');
  requirePositiveId(input.businessId, 'businessId');
  if (!Array.isArray(input.hours)) throw new Error('Business Hours must be an array');
  if (input.hours.length > 7) throw new Error('A maximum of seven Business Hours records is allowed');
  const seen = new Set<number>();
  input.hours.forEach((entry, index) => {
    validateEntry(entry, index);
    if (seen.has(entry.dayOfWeek)) throw new Error('Duplicate Business Hours days are not allowed');
    seen.add(entry.dayOfWeek);
  });
  return input;
};

export class BusinessHoursServiceImpl implements BusinessHoursService {
  constructor(private readonly repository: BusinessHoursRepository) {}

  async getBusinessHours(context: AuthContext, businessId: number): Promise<BusinessHours[]> {
    requireAuthenticatedContext(context);
    requirePositiveId(businessId, 'businessId');
    return this.repository.getBusinessHours(context, businessId);
  }

  async getPublicBusinessHours(context: AuthContext, businessId: number): Promise<BusinessHours[]> {
    requireAuthenticatedContext(context);
    requirePositiveId(businessId, 'businessId');
    return this.repository.getPublicBusinessHours(context, businessId);
  }

  async replaceBusinessHours(context: AuthContext, input: ReplaceBusinessHoursInput): Promise<BusinessHours[]> {
    return this.repository.replaceBusinessHours(context, validateReplace(context, input));
  }
}
