import { assertRole, requireAuthenticatedContext, type AuthContext } from '../../auth/authorization';
import type {
  AuthorizeContactAccessCommercialInput,
  ContactAccessCommercialGrantResult,
  ContactAccessCommercialRepository,
  ContactAccessCommercialService,
} from './contracts';

const requirePositiveId = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value as number;
};

const normalizeIdempotencyKey = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new Error('idempotencyKey must be between 8 and 200 characters');
  }
  const normalized = value.trim();
  if (normalized.length < 8 || normalized.length > 200) {
    throw new Error('idempotencyKey must be between 8 and 200 characters');
  }
  return normalized;
};

const normalizeCommercialSource = (value: unknown): string => {
  if (typeof value !== 'string') {
    throw new Error('commercialSource must be between 1 and 100 characters');
  }
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 100) {
    throw new Error('commercialSource must be between 1 and 100 characters');
  }
  return normalized;
};

const validateInput = (
  context: AuthContext,
  input: AuthorizeContactAccessCommercialInput,
): AuthorizeContactAccessCommercialInput => {
  requireAuthenticatedContext(context);
  assertRole(context, 'business');
  if (!input || typeof input !== 'object') {
    throw new Error('Contact Access commercial authorization input is required');
  }
  if ('payment_success' in (input as unknown as Record<string, unknown>)) {
    throw new Error('Untrusted payment signals are not accepted for commercial authorization');
  }
  return {
    businessId: requirePositiveId(input.businessId, 'businessId'),
    opportunityId: requirePositiveId(input.opportunityId, 'opportunityId'),
    idempotencyKey: normalizeIdempotencyKey(input.idempotencyKey),
    commercialSource: normalizeCommercialSource(input.commercialSource),
  };
};

export class ContactAccessCommercialServiceImpl implements ContactAccessCommercialService {
  constructor(private readonly repository: ContactAccessCommercialRepository) {}

  async authorizeContactAccessFromVerifiedCommercial(
    context: AuthContext,
    input: AuthorizeContactAccessCommercialInput,
  ): Promise<ContactAccessCommercialGrantResult> {
    return this.repository.authorizeContactAccessFromVerifiedCommercial(
      context,
      validateInput(context, input),
    );
  }
}
