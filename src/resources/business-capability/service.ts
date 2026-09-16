import { requireAuthenticatedContext, type AuthContext } from '../../auth/authorization';
import type {
  BusinessCapability,
  BusinessCapabilityId,
  BusinessCapabilityRepository,
  BusinessCapabilityService,
  CreateBusinessCapabilityInput,
} from './contracts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROFICIENCY = new Set(['foundational', 'proficient', 'advanced', 'expert']);

const requirePositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${field} must be a positive integer`);
  return value as number;
};

const validateCreate = (context: AuthContext, input: CreateBusinessCapabilityInput): CreateBusinessCapabilityInput => {
  requireAuthenticatedContext(context);
  if (!input || typeof input !== 'object') throw new Error('Business capability input is required');
  requirePositiveId(input.businessId, 'businessId');
  if (typeof input.capabilityId !== 'string' || !UUID_RE.test(input.capabilityId)) throw new Error('Capability ID must be a valid UUID');
  if (input.proficiencyLevel != null && !PROFICIENCY.has(input.proficiencyLevel)) throw new Error('Invalid proficiency level');
  if (input.description != null) {
    const value = input.description.trim();
    if (value.length < 1 || value.length > 1000) throw new Error('Description must contain between 1 and 1000 characters');
  }
  if (input.sourceReference != null) {
    const value = input.sourceReference.trim();
    if (value.length < 1 || value.length > 500) throw new Error('Source reference must contain between 1 and 500 characters');
  }
  if (input.effectiveFrom !== undefined && !(input.effectiveFrom instanceof Date) || input.effectiveFrom instanceof Date && Number.isNaN(input.effectiveFrom.getTime())) {
    throw new Error('Invalid effective-from date');
  }
  if (input.effectiveUntil !== undefined && input.effectiveUntil !== null && (!(input.effectiveUntil instanceof Date) || Number.isNaN(input.effectiveUntil.getTime()))) {
    throw new Error('Invalid effective-until date');
  }
  if (input.effectiveFrom instanceof Date && input.effectiveUntil instanceof Date && input.effectiveUntil <= input.effectiveFrom) {
    throw new Error('Effective-until must be later than effective-from');
  }
  return input;
};

export class BusinessCapabilityServiceImpl implements BusinessCapabilityService {
  constructor(private readonly repository: BusinessCapabilityRepository) {}

  async createBusinessCapability(context: AuthContext, input: CreateBusinessCapabilityInput): Promise<BusinessCapability> {
    return this.repository.createBusinessCapability(context, validateCreate(context, input));
  }

  async getBusinessCapability(context: AuthContext, businessCapabilityId: BusinessCapabilityId): Promise<BusinessCapability | null> {
    requireAuthenticatedContext(context);
    requirePositiveId(businessCapabilityId, 'businessCapabilityId');
    return this.repository.getBusinessCapability(context, businessCapabilityId);
  }

  async listBusinessCapabilities(context: AuthContext, businessId: number): Promise<BusinessCapability[]> {
    requireAuthenticatedContext(context);
    requirePositiveId(businessId, 'businessId');
    return this.repository.listBusinessCapabilities(context, businessId);
  }
}
