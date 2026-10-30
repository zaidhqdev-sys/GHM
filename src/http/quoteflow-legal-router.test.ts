import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import express from 'express';
import type { Pool } from 'pg';
import { registerQuoteFlowLegalRoutes } from './quoteflow-legal-router';

const start = async (query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>) => {
  const app = express();
  app.use(express.json());
  const auth: express.RequestHandler = (req, _res, next) => {
    req.authContext = { userId: 77, role: 'business' };
    next();
  };
  registerQuoteFlowLegalRoutes(app, { query } as unknown as Pick<Pool, 'query'>, auth);
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
};

test('current legal documents fail closed when no approved document versions are published', async () => {
  const { server, baseUrl } = await start(async () => ({ rows: [] }));
  try {
    const response = await fetch(`${baseUrl}/api/v1/quoteflow/legal/documents/current`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'legal_documents_unavailable' });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('legal acceptance uses the authenticated account and server-side version contract', async () => {
  let receivedSql = '';
  let receivedValues: unknown[] = [];
  let queryCount = 0;
  const { server, baseUrl } = await start(async (sql, values) => {
    queryCount += 1;
    if (queryCount === 1) {
      assert.match(sql, /ghm\.quoteflow_legal_current_documents/);
      assert.deepEqual(values, [77]);
      return { rows: [{
        document_key: 'terms_of_service',
        title: 'Terms of Service',
        is_required: true,
        version_id: '12',
        version_label: '1.0',
        content_markdown: 'Approved terms for test',
        content_sha256: 'f566662530f5a2cf0b738ddc0df4c02f3c4024a0719e3849601de908d4127457',
        effective_at: '2026-10-30T00:00:00.000Z',
        accepted_at: null,
      }] };
    }
    receivedSql = sql;
    receivedValues = values ?? [];
    return { rows: [{
      acceptance_id: '501',
      account_id: '77',
      document_version_id: '12',
      document_sha256: 'f566662530f5a2cf0b738ddc0df4c02f3c4024a0719e3849601de908d4127457',
      accepted_at: '2026-10-30T22:00:00.000Z',
      acceptance_channel: 'quoteflow_android',
    }] };
  });
  try {
    const response = await fetch(`${baseUrl}/api/v1/quoteflow/legal/acceptances`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ versionId: 12, accepted: true, accountId: 999 }),
    });
    assert.equal(response.status, 400);
    const accepted = await fetch(`${baseUrl}/api/v1/quoteflow/legal/acceptances`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ versionId: 12, accepted: true }),
    });
    assert.equal(accepted.status, 201);
    assert.match(receivedSql, /ghm\.quoteflow_legal_accept/);
    assert.deepEqual(receivedValues, [77, 12, 'quoteflow_android']);
    const body = await accepted.json() as { acceptance: { id: number; accountId: number; versionId: number } };
    assert.deepEqual(body.acceptance, { id: 501, accountId: 77, versionId: 12, sha256: 'f566662530f5a2cf0b738ddc0df4c02f3c4024a0719e3849601de908d4127457', acceptedAt: '2026-10-30T22:00:00.000Z', channel: 'quoteflow_android' });
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('legal acceptance rejects malformed or false consent before persistence', async () => {
  let calls = 0;
  const { server, baseUrl } = await start(async () => { calls += 1; return { rows: [] }; });
  try {
    for (const body of [
      { versionId: 0, accepted: true },
      { versionId: 12, accepted: false },
      { versionId: 12, accepted: true, acceptedAt: '2026-01-01T00:00:00Z' },
    ]) {
      const response = await fetch(`${baseUrl}/api/v1/quoteflow/legal/acceptances`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }
    assert.equal(calls, 0);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
