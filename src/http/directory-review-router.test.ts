import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor } from './test-resource-auth';
import type { AuthContext } from '../auth/authorization';
import type { BusinessIdentityService } from '../resources/business-identity/contracts';
import type { DirectoryReviewPresentation, DirectoryReviewService } from '../resources/directory-review/contracts';

const start = async (service: DirectoryReviewService) => {
  const server = http.createServer(createApp({
    resourceAuthMiddleware: httpTestAuth,
    businessIdentityService: {} as BusinessIdentityService,
    directoryReviewService: service,
  }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};
const close = (server: http.Server) => new Promise<void>(resolve => server.close(() => resolve()));

const presentation: DirectoryReviewPresentation = {
  business_id: 55,
  verification_status: 'unverified',
  is_verified: false,
  directory_review_submitted_at: null,
  directory_review_last_reason: null,
  directory_review_last_event_type: null,
};

test('disabled founder directory-review submit, queue and decision routes fail closed without invoking revoked RPCs', async () => {
  let submitCalls = 0;
  let listCalls = 0;
  let reviewCalls = 0;
  const service = {
    submit: async () => { submitCalls += 1; throw new Error('must not be called'); },
    list: async () => { listCalls += 1; throw new Error('must not be called'); },
    review: async () => { reviewCalls += 1; throw new Error('must not be called'); },
    getPresentation: async () => presentation,
  } as unknown as DirectoryReviewService;
  const { server, baseUrl } = await start(service);
  try {
    const businessToken = tokenFor({ userId: 42, role: 'business' });
    const adminToken = tokenFor({ userId: 7, role: 'admin' });

    const submit = await fetch(`${baseUrl}/api/v1/businesses/55/directory-review`, {
      method: 'POST',
      headers: { authorization: `Bearer ${businessToken}`, 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(submit.status, 403);
    assert.deepEqual(await submit.json(), { error: 'forbidden' });

    const list = await fetch(`${baseUrl}/api/v1/admin/directory-reviews`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(list.status, 403);
    assert.deepEqual(await list.json(), { error: 'forbidden' });

    const decision = await fetch(`${baseUrl}/api/v1/admin/directory-reviews/55`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve' }),
    });
    assert.equal(decision.status, 403);
    assert.deepEqual(await decision.json(), { error: 'forbidden' });

    assert.equal(submitCalls, 0);
    assert.equal(listCalls, 0);
    assert.equal(reviewCalls, 0);
  } finally {
    await close(server);
  }
});

test('founder authority endpoint reports disabled without invoking a database service', async () => {
  let called = false;
  const service = {
    submit: async () => { throw new Error('must not be called'); },
    list: async () => { throw new Error('must not be called'); },
    review: async () => { throw new Error('must not be called'); },
    getPresentation: async () => presentation,
    isFounderReviewer: async () => { called = true; throw new Error('revoked database function must not be called'); },
  } as unknown as DirectoryReviewService;
  const { server, baseUrl } = await start(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/admin/directory-reviews/authority`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 7, role: 'admin' })}` },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { isFounderReviewer: false });
    assert.equal(called, false);
  } finally {
    await close(server);
  }
});

test('business owner review presentation remains available through the read-only route', async () => {
  let received: unknown;
  const service = {
    submit: async () => { throw new Error('must not be called'); },
    list: async () => { throw new Error('must not be called'); },
    review: async () => { throw new Error('must not be called'); },
    getPresentation: async (context: AuthContext, businessId: number) => {
      received = { context, businessId };
      return presentation;
    },
  } as unknown as DirectoryReviewService;
  const { server, baseUrl } = await start(service);
  try {
    const response = await fetch(`${baseUrl}/api/v1/businesses/55/directory-review-presentation`, {
      headers: { authorization: `Bearer ${tokenFor({ userId: 42, role: 'business' })}` },
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { review: DirectoryReviewPresentation };
    assert.equal(body.review.business_id, 55);
    assert.deepEqual(received, { context: { userId: 42, role: 'business' }, businessId: 55 });
  } finally {
    await close(server);
  }
});
