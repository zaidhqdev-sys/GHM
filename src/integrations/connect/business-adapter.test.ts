import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ConnectBusinessProvisioningGatewayClient,
  ConnectBusinessProvisioningInput,
  ConnectBusinessProvisioningResult,
} from './business-provisioning-contracts';
import { ConnectBusinessAdapter } from './business-adapter';

const accessToken = 'verified-ghm-access-token';

const business = {
  id: 42,
  name: 'Acme Construction',
  slug: 'acme-construction',
  description: null,
  phone: null,
  email: null,
  province: null,
  city: null,
  physicalAddress: null,
  latitude: null,
  longitude: null,
  whatsapp: null,
  website: null,
  avatarLetter: null,
  avatarColor: null,
  yearsInBusiness: null,
  isSupplier: false,
  logoUrl: null,
  insuranceVerified: false,
  jobsCompleted: 0,
  verificationStatus: 'unverified' as const,
  isActive: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const mapping = {
  id: 9,
  provider: 'supabase',
  externalBusinessId: '11111111-1111-4111-8111-111111111111',
  businessId: 42,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

class FakeGateway implements ConnectBusinessProvisioningGatewayClient {
  calls: Array<{ accessToken: string; input: ConnectBusinessProvisioningInput }> = [];
  constructor(private readonly result: ConnectBusinessProvisioningResult) {}
  async provisionOrResolve(accessToken: string, input: ConnectBusinessProvisioningInput) {
    this.calls.push({ accessToken, input });
    return this.result;
  }
}

const result = (outcome: 'resolved' | 'provisioned'): ConnectBusinessProvisioningResult => ({
  outcome,
  business,
  mapping,
});

test('existing Connect Business mapping resolves through the signed gateway', async () => {
  const gateway = new FakeGateway(result('resolved'));
  const adapter = new ConnectBusinessAdapter(gateway);

  const resolved = await adapter.provisionOrResolve(accessToken, {
    externalBusinessId: '11111111-1111-4111-8111-111111111111',
    name: 'Ignored For Existing Mapping',
  });

  assert.equal(resolved.outcome, 'resolved');
  assert.equal(resolved.business.id, 42);
  assert.equal(resolved.mapping.businessId, 42);
  assert.deepEqual(gateway.calls, [{
    accessToken,
    input: {
      externalBusinessId: '11111111-1111-4111-8111-111111111111',
      name: 'Ignored For Existing Mapping',
    },
  }]);
});

test('unmapped Connect Business provisioning is delegated atomically to the signed gateway', async () => {
  const gateway = new FakeGateway(result('provisioned'));
  const adapter = new ConnectBusinessAdapter(gateway);

  const provisioned = await adapter.provisionOrResolve(accessToken, {
    externalBusinessId: '22222222-2222-4222-8222-222222222222',
    name: ' Acme Construction ',
  });

  assert.equal(provisioned.outcome, 'provisioned');
  assert.equal(provisioned.business.id, 42);
  assert.equal(provisioned.mapping.businessId, 42);
  assert.equal(gateway.calls[0].input.name, 'Acme Construction');
});

test('Connect Business identifier validation fails before calling the gateway', async () => {
  const gateway = new FakeGateway(result('provisioned'));
  const adapter = new ConnectBusinessAdapter(gateway);

  await assert.rejects(
    () => adapter.provisionOrResolve(accessToken, {
      externalBusinessId: 'not-a-uuid',
      name: 'Acme Construction',
    }),
    /Invalid Connect external Business identifier/,
  );
  assert.equal(gateway.calls.length, 0);
});

test('Connect Business provisioning requires the verified access token', async () => {
  const gateway = new FakeGateway(result('provisioned'));
  const adapter = new ConnectBusinessAdapter(gateway);

  await assert.rejects(
    () => adapter.provisionOrResolve(' ', {
      externalBusinessId: '33333333-3333-4333-8333-333333333333',
      name: 'Blocked Business',
    }),
    /verified access token/,
  );
  assert.equal(gateway.calls.length, 0);
});

test('missing bearer token cannot invoke Connect Business provisioning', async () => {
  const gateway = new FakeGateway(result('provisioned'));
  const adapter = new ConnectBusinessAdapter(gateway);
  await assert.rejects(
    () => adapter.provisionOrResolve(' ', {
      externalBusinessId: '33333333-3333-4333-8333-333333333333',
      name: 'Blocked Business',
    }),
    /verified access token/,
  );
  assert.equal(gateway.calls.length, 0);
});
