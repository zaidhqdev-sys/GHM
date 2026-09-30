import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { createApp } from './app';
import type { AuthContext } from '../auth/authorization';
import { config } from '../config';
import type {
  ContactAccessCheckResult,
  ContactAccessService,
  ContactDisclosure,
  GrantContactAccessInput,
  RevokeContactAccessInput,
} from '../resources/contact-access/contracts';
import type { EnquiryService } from '../resources/enquiry/contracts';

const businessId = 265;
const opportunityId = 501;
const statusPath = `/api/v1/businesses/${businessId}/opportunities/${opportunityId}/contact-access`;
const disclosePath = `/api/v1/businesses/${businessId}/opportunities/${opportunityId}/contact-access/contacts`;

const tokenFor = (context: AuthContext): string =>
  jwt.sign({ userId: context.userId, role: context.role }, config.jwtSecret);

const disclosureFixture = (overrides: Partial<ContactDisclosure> = {}): ContactDisclosure => ({
  customerName: 'Customer One',
  customerPhone: '+27123456789',
  customerEmail: 'customer@example.com',
  ...overrides,
});

const checkFixture = (
  overrides: Partial<ContactAccessCheckResult> = {},
): ContactAccessCheckResult => ({
  businessId,
  opportunityId,
  status: 'active',
  entitlement: {
    id: 11,
    businessId,
    opportunityId,
    authorizationStatus: 'active',
    grantReason: 'manual_promotional',
    grantSource: 'founder_promo',
    grantedByAccountId: 468,
    grantedAt: new Date('2026-09-23T10:00:00.000Z'),
    commercialEventReference: null,
    commercialFactId: null,
    revokedAt: null,
    revokedByAccountId: null,
    revocationReason: null,
    createdAt: new Date('2026-09-23T10:00:00.000Z'),
    updatedAt: new Date('2026-09-23T10:00:00.000Z'),
  },
  ...overrides,
});

const stubContactAccessService = (
  overrides: Partial<ContactAccessService> = {},
): ContactAccessService => ({
  grantContactAccess: async (_context: AuthContext, _input: GrantContactAccessInput) => {
    throw new Error('grant must not be called');
  },
  getContactAccess: async () => {
    throw new Error('getContactAccess must not be called');
  },
  revokeContactAccess: async (_context: AuthContext, _input: RevokeContactAccessInput) => {
    throw new Error('revoke must not be called');
  },
  discloseContactAccess: async () => {
    throw new Error('discloseContactAccess must not be called');
  },
  ...overrides,
});

const stubEnquiryService = (overrides: Partial<EnquiryService> = {}): EnquiryService => ({
  createEnquiry: async () => {
    throw new Error('enquiry create must not be called');
  },
  getOwnEnquiry: async () => {
    throw new Error('enquiry getOwn must not be called');
  },
  getReceivedEnquiry: async () => {
    throw new Error('enquiry getReceived must not be called');
  },
  getReceivedEnquiries: async () => {
    throw new Error('enquiry getReceivedEnquiries must not be called');
  },
  updateReceivedEnquiryStatus: async () => {
    throw new Error('enquiry updateStatus must not be called');
  },
  findAssociationByOpportunityId: async () => {
    throw new Error('enquiry association must not be called from Contact Access HTTP');
  },
  ...overrides,
});

const startServer = async (
  contactAccessService: ContactAccessService,
  enquiryService: EnquiryService = stubEnquiryService(),
) => {
  const server = http.createServer(createApp({
    businessIdentityService: {} as never,
    businessHoursService: {} as never,
    projectService: {} as never,
    publicProjectService: {} as never,
    enquiryService,
    campaignService: {} as never,
    opportunityService: {} as never,
    contactAccessService,
  }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

const assertNoContactFields = (value: unknown): void => {
  const encoded = JSON.stringify(value);
  for (const forbidden of [
    'customerName',
    'customerPhone',
    'customerEmail',
    'customerId',
    'creatorAccountId',
    'entitlement',
    'grantSource',
    'grantedByAccountId',
  ]) {
    assert.equal(encoded.includes(`"${forbidden}"`), false, `must not contain ${forbidden}`);
  }
};

test('Contact Access status requires authentication', async () => {
  const { server, baseUrl } = await startServer(stubContactAccessService());
  try {
    const response = await fetch(`${baseUrl}${statusPath}`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Contact Access disclose requires authentication', async () => {
  const { server, baseUrl } = await startServer(stubContactAccessService());
  try {
    const response = await fetch(`${baseUrl}${disclosePath}`);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: 'unauthorized' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Contact Access status rejects customer role', async () => {
  const service = stubContactAccessService({
    getContactAccess: async () => {
      throw new Error('Insufficient role');
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}${statusPath}`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 99, role: 'customer' })}` },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'forbidden' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Contact Access disclose rejects customer role', async () => {
  const service = stubContactAccessService({
    discloseContactAccess: async () => {
      throw new Error('Insufficient role');
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}${disclosePath}`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 99, role: 'customer' })}` },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'forbidden' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Contact Access status rejects admin role', async () => {
  const service = stubContactAccessService({
    getContactAccess: async () => {
      throw new Error('Insufficient role');
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}${statusPath}`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 1, role: 'admin' })}` },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'forbidden' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Contact Access disclose rejects admin role', async () => {
  const service = stubContactAccessService({
    discloseContactAccess: async () => {
      throw new Error('Insufficient role');
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}${disclosePath}`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 1, role: 'admin' })}` },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'forbidden' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Contact Access status rejects inactive or non-member Business', async () => {
  const service = stubContactAccessService({
    getContactAccess: async () => {
      throw new Error('Business read permission required');
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}${statusPath}`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 468, role: 'business' })}` },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'forbidden' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Contact Access disclose rejects inactive or non-member Business', async () => {
  const service = stubContactAccessService({
    discloseContactAccess: async () => {
      throw new Error('Business read permission required');
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}${disclosePath}`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 468, role: 'business' })}` },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'forbidden' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Contact Access disclose rejects wrong Business membership failure', async () => {
  const service = stubContactAccessService({
    discloseContactAccess: async () => {
      throw new Error('Business read permission required');
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(
      `${baseUrl}/api/v1/businesses/999/opportunities/${opportunityId}/contact-access/contacts`,
      {
        headers: { authorization: `Bearer ${tokenFor({ userId: 468, role: 'business' })}` },
      },
    );
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'forbidden' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Contact Access disclose denies absent Contact Access', async () => {
  const service = stubContactAccessService({
    discloseContactAccess: async () => {
      throw new Error('Contact Access disclosure denied');
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}${disclosePath}`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 468, role: 'business' })}` },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'forbidden' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Contact Access disclose denies revoked Contact Access', async () => {
  const service = stubContactAccessService({
    discloseContactAccess: async () => {
      throw new Error('Contact Access disclosure denied');
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}${disclosePath}`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 468, role: 'business' })}` },
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'forbidden' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Contact Access disclose denies wrong Opportunity', async () => {
  let receivedOpportunityId: number | undefined;
  const service = stubContactAccessService({
    discloseContactAccess: async (_context, _businessId, requestedOpportunityId) => {
      receivedOpportunityId = requestedOpportunityId;
      throw new Error('Contact Access disclosure denied');
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(
      `${baseUrl}/api/v1/businesses/${businessId}/opportunities/999/contact-access/contacts`,
      {
        headers: { authorization: `Bearer ${tokenFor({ userId: 468, role: 'business' })}` },
      },
    );
    assert.equal(response.status, 403);
    assert.equal(receivedOpportunityId, 999);
    assert.deepEqual(await response.json(), { error: 'forbidden' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Contact Access status returns active/revoked/absent without contact fields', async () => {
  for (const status of ['active', 'revoked', 'absent'] as const) {
    const service = stubContactAccessService({
      getContactAccess: async () => checkFixture({
        status,
        entitlement: status === 'absent' ? null : checkFixture().entitlement,
      }),
    });
    const { server, baseUrl } = await startServer(service);
    try {
      const response = await fetch(`${baseUrl}${statusPath}`, {
        headers: { authorization: `Bearer ${tokenFor({ userId: 468, role: 'business' })}` },
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body, {
        contactAccess: {
          businessId,
          opportunityId,
          status,
        },
      });
      assertNoContactFields(body);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
});

test('Contact Access disclose returns only name/phone/email for active Contact Access', async () => {
  let received: { context: AuthContext; businessId: number; opportunityId: number } | undefined;
  const disclosure = disclosureFixture();
  const service = stubContactAccessService({
    discloseContactAccess: async (context, requestedBusinessId, requestedOpportunityId) => {
      received = {
        context,
        businessId: requestedBusinessId,
        opportunityId: requestedOpportunityId,
      };
      return disclosure;
    },
  });
  const { server, baseUrl } = await startServer(service);
  try {
    const response = await fetch(`${baseUrl}${disclosePath}`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 468, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(received, {
      context: { userId: 468, role: 'business' },
      businessId,
      opportunityId,
    });
    const body = await response.json() as {
      contactDisclosure: ContactDisclosure;
    };
    assert.deepEqual(body, {
      contactDisclosure: {
        customerName: 'Customer One',
        customerPhone: '+27123456789',
        customerEmail: 'customer@example.com',
      },
    });
    assert.deepEqual(Object.keys(body.contactDisclosure).sort(), [
      'customerEmail',
      'customerName',
      'customerPhone',
    ]);
    assert.equal('customerId' in body.contactDisclosure, false);
    assert.equal('creatorAccountId' in body.contactDisclosure, false);
    assert.equal('entitlement' in body, false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Contact Access HTTP disclosure does not call Enquiry service directly', async () => {
  let enquiryAssociationCalls = 0;
  let discloseCalls = 0;
  const enquiryService = stubEnquiryService({
    findAssociationByOpportunityId: async () => {
      enquiryAssociationCalls += 1;
      return { enquiryId: 1, businessId, opportunityId };
    },
    getReceivedEnquiry: async () => {
      enquiryAssociationCalls += 1;
      return null;
    },
  });
  const contactAccessService = stubContactAccessService({
    discloseContactAccess: async () => {
      discloseCalls += 1;
      return disclosureFixture();
    },
  });
  const { server, baseUrl } = await startServer(contactAccessService, enquiryService);
  try {
    const response = await fetch(`${baseUrl}${disclosePath}`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 468, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    assert.equal(discloseCalls, 1);
    assert.equal(enquiryAssociationCalls, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Contact Access routes reject invalid path ids', async () => {
  const { server, baseUrl } = await startServer(stubContactAccessService());
  try {
    const token = tokenFor({ userId: 468, role: 'business' });
    const statusResponse = await fetch(
      `${baseUrl}/api/v1/businesses/not-an-id/opportunities/${opportunityId}/contact-access`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(statusResponse.status, 400);
    assert.deepEqual(await statusResponse.json(), { error: 'invalid_request' });

    const discloseResponse = await fetch(
      `${baseUrl}/api/v1/businesses/${businessId}/opportunities/0/contact-access/contacts`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(discloseResponse.status, 400);
    assert.deepEqual(await discloseResponse.json(), { error: 'invalid_request' });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
