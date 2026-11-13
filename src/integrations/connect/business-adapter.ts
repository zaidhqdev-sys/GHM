import type {
  ConnectBusinessProvisioningGatewayClient,
  ConnectBusinessProvisioningInput,
  ConnectBusinessProvisioningResult,
} from './business-provisioning-contracts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ConnectBusinessProvisioningOutcome = ConnectBusinessProvisioningResult['outcome'];
export type { ConnectBusinessProvisioningInput, ConnectBusinessProvisioningResult };

const normalizeInput = (input: ConnectBusinessProvisioningInput): ConnectBusinessProvisioningInput => {
  const externalBusinessId = input.externalBusinessId.trim().toLowerCase();
  if (!UUID_PATTERN.test(externalBusinessId)) {
    throw new Error('Invalid Connect external Business identifier');
  }
  const name = input.name.trim();
  if (!name || name.length > 200) throw new Error('Connect Business name is required');
  return { externalBusinessId, name };
};

export class ConnectBusinessAdapter {
  constructor(private readonly gateway: ConnectBusinessProvisioningGatewayClient) {}

  async provisionOrResolve(
    accessToken: string,
    input: ConnectBusinessProvisioningInput,
  ): Promise<ConnectBusinessProvisioningResult> {
    if (!accessToken.trim()) throw new Error('Connect Business provisioning requires the verified access token');
    return this.gateway.provisionOrResolve(accessToken, normalizeInput(input));
  }
}
