import { assertRole, requireAuthenticatedContext, type AuthContext } from '../../auth/authorization.js';
import type {
  Capability,
  CapabilityId,
  CapabilityRepository,
  CapabilityDraftInput,
  CapabilityLifecycle,
  CapabilityService,
} from './contracts.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requireAdmin = (context: AuthContext): void => {
  requireAuthenticatedContext(context);
  assertRole(context, 'admin');
};

const validateDraft = (input: CapabilityDraftInput): CapabilityDraftInput => {
  if (typeof input.name !== 'string' || input.name.trim().length < 1 || input.name.trim().length > 120) {
    throw new Error('Capability name must contain 1 to 120 characters');
  }
  if (typeof input.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug.trim())) {
    throw new Error('Capability slug is invalid');
  }
  const description = input.description?.trim() || null;
  if (description !== null && description.length > 2000) throw new Error('Capability description is too long');
  const parentId = input.parentId ?? null;
  if (parentId !== null && !UUID_PATTERN.test(parentId)) throw new Error('Invalid parent Capability ID');
  const sortOrder = input.sortOrder ?? 0;
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) throw new Error('Capability sort order is invalid');
  const sourceReference = input.sourceReference?.trim() || null;
  if (sourceReference !== null && sourceReference.length > 500) throw new Error('Capability source reference is too long');
  return { name: input.name.trim(), slug: input.slug.trim(), description, parentId, sortOrder, sourceReference };
};

export class CapabilityServiceImpl implements CapabilityService {
  constructor(private readonly repository: CapabilityRepository) {}

  listGoverned(context: AuthContext): Promise<Capability[]> {
    requireAdmin(context);
    return this.repository.listGoverned(context);
  }

  createDraft(context: AuthContext, input: CapabilityDraftInput): Promise<Capability> {
    requireAdmin(context);
    return this.repository.createDraft(context, validateDraft(input));
  }

  updateDraft(context: AuthContext, capabilityId: CapabilityId, input: CapabilityDraftInput): Promise<Capability> {
    requireAdmin(context);
    if (!UUID_PATTERN.test(capabilityId)) throw new Error('Invalid capabilityId');
    const validated = validateDraft(input);
    if (validated.parentId === capabilityId) throw new Error('Invalid parent Capability ID');
    return this.repository.updateDraft(context, capabilityId, validated);
  }

  transition(
    context: AuthContext,
    capabilityId: CapabilityId,
    targetStatus: CapabilityLifecycle,
    replacedByCapabilityId: CapabilityId | null = null,
  ): Promise<Capability> {
    requireAdmin(context);
    if (!UUID_PATTERN.test(capabilityId)) throw new Error('Invalid capabilityId');
    if (!['active', 'deprecated', 'retired'].includes(targetStatus)) throw new Error('Invalid Capability lifecycle target');
    if (replacedByCapabilityId !== null && !UUID_PATTERN.test(replacedByCapabilityId)) throw new Error('Invalid replacement Capability ID');
    return this.repository.transition(context, capabilityId, targetStatus, replacedByCapabilityId);
  }

  getCapability(
    context: AuthContext,
    capabilityId: CapabilityId,
  ): Promise<Capability> {
    return this.repository.getCapability(context, capabilityId);
  }

  listActiveCapabilities(
    context: AuthContext,
  ): Promise<Capability[]> {
    return this.repository.listActiveCapabilities(context);
  }

  listSelectableCapabilities(
    context: AuthContext,
  ): Promise<Capability[]> {
    return this.repository.listSelectableCapabilities(context);
  }
}
