import type { BusinessExternalMapping } from '../../auth/foundation/types';
import type { BusinessIdentity } from '../../resources/business-identity/contracts';

export interface ConnectBusinessProvisioningInput {
  readonly externalBusinessId: string;
  readonly name: string;
}

export interface ConnectBusinessProvisioningResult {
  readonly outcome: 'resolved' | 'provisioned';
  readonly business: BusinessIdentity;
  readonly mapping: BusinessExternalMapping;
}

export interface ConnectBusinessProvisioningGatewayClient {
  provisionOrResolve(
    accessToken: string,
    input: ConnectBusinessProvisioningInput,
  ): Promise<ConnectBusinessProvisioningResult>;
}
