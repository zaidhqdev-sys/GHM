import type { AuthContext } from '../../auth/authorization.js';
import type {
  Capability,
  CapabilityId,
  CapabilityRepository,
  CapabilityService,
} from './contracts.js';

export class CapabilityServiceImpl implements CapabilityService {
  constructor(private readonly repository: CapabilityRepository) {}

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
