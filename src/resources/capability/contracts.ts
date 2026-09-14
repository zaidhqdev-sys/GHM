import type { AuthContext } from '../../auth/authorization.js';

export type CapabilityId = string;

export type CapabilityLifecycle =
  | 'draft'
  | 'active'
  | 'deprecated'
  | 'retired';

export interface Capability {
  id: CapabilityId;
  parentId: CapabilityId | null;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  lifecycleStatus: CapabilityLifecycle;
  taxonomyVersion: number;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  sourceAuthority: string;
  sourceReference: string | null;
  replacedByCapabilityId: CapabilityId | null;
  isSelectable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CapabilityRepository {
  getCapability(
    context: AuthContext,
    capabilityId: CapabilityId,
  ): Promise<Capability>;

  listActiveCapabilities(
    context: AuthContext,
  ): Promise<Capability[]>;

  listSelectableCapabilities(
    context: AuthContext,
  ): Promise<Capability[]>;
}

export interface CapabilityService {
  getCapability(
    context: AuthContext,
    capabilityId: CapabilityId,
  ): Promise<Capability>;

  listActiveCapabilities(
    context: AuthContext,
  ): Promise<Capability[]>;

  listSelectableCapabilities(
    context: AuthContext,
  ): Promise<Capability[]>;
}

export const CAPABILITY_OPERATIONS = Object.freeze({
  GET: 'capability.get',
  LIST_ACTIVE: 'capability.list_active',
  LIST_SELECTABLE: 'capability.list_selectable',
} as const);
