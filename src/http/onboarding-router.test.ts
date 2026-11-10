import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from './app';
import { httpTestAuth, tokenFor } from './test-resource-auth';
import type { OnboardingProgress, OnboardingProgressService } from '../resources/onboarding/contracts';

const row: OnboardingProgress = {
  id: 1, accountId: 42, journeyId: 'business_setup_v1', stepId: 'profile',
  status: 'pending', firstStartedAt: new Date(1000), completedAt: null, dismissedAt: null,
  createdAt: new Date(1000), updatedAt: new Date(1000),
};

const start = async (service: OnboardingProgressService) => {
  const server = http.createServer(createApp({ resourceAuthMiddleware: httpTestAuth, onboardingService: service }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

test('onboarding progress requires GHM authentication', async () => {
  const service = {} as OnboardingProgressService;
  const { server, baseUrl } = await start(service);
  try {
    assert.equal((await fetch(`${baseUrl}/api/v1/onboarding/progress`)).status, 401);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('onboarding progress reads and mutations derive account from GHM auth context', async () => {
  const received: unknown[][] = [];
  const service = {
    getProgress: async (...args: unknown[]) => { received.push(args); return [row]; },
    start: async (...args: unknown[]) => { received.push(args); return row; },
    complete: async (...args: unknown[]) => { received.push(args); return { ...row, status: 'completed' }; },
    dismiss: async (...args: unknown[]) => { received.push(args); return { ...row, status: 'dismissed' }; },
  } as unknown as OnboardingProgressService;
  const { server, baseUrl } = await start(service);
  try {
    const headers = { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}` };
    const read = await fetch(`${baseUrl}/api/v1/onboarding/progress?journeyId=business_setup_v1`, { headers });
    assert.equal(read.status, 200);
    const started = await fetch(`${baseUrl}/api/v1/onboarding/progress/start`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ journeyId: 'business_setup_v1', stepId: 'profile' }),
    });
    assert.equal(started.status, 200);
    const completed = await fetch(`${baseUrl}/api/v1/onboarding/progress/complete`, {
      method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ journeyId: 'business_setup_v1', stepId: 'profile' }),
    });
    assert.equal(completed.status, 200);
    assert.deepEqual(received, [
      [{ userId: 42, role: 'customer' }, 'business_setup_v1'],
      [{ userId: 42, role: 'customer' }, 'business_setup_v1', 'profile'],
      [{ userId: 42, role: 'customer' }, 'business_setup_v1', 'profile'],
    ]);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('onboarding routes reject client-supplied account IDs and invalid journey/step identifiers', async () => {
  let calls = 0;
  const service = {
    getProgress: async () => { calls += 1; return []; },
    start: async () => { calls += 1; return row; },
    complete: async () => { calls += 1; return row; },
    dismiss: async () => { calls += 1; return row; },
  } as unknown as OnboardingProgressService;
  const { server, baseUrl } = await start(service);
  try {
    const headers = { authorization: `Bearer ${tokenFor({ userId: 42, role: 'customer' })}` };
    for (const body of [
      { journeyId: 'Business_Setup_v1', stepId: 'profile' },
      { journeyId: 'business_setup_v1', stepId: 'Bad Step' },
      { journeyId: 'business_setup_v1', stepId: 'profile', accountId: 999 },
    ]) {
      const response = await fetch(`${baseUrl}/api/v1/onboarding/progress/start`, {
        method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }
    assert.equal(calls, 0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
