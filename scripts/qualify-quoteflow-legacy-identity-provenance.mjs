import fs from 'node:fs';
import crypto from 'node:crypto';
import { Client } from 'pg';
import 'dotenv/config';

const required = ['GHM_QUOTEFLOW_SOURCE_SNAPSHOT_FILE', 'GHM_LEGACY_USER_RECONCILIATION_FILE'];
const missing = required.filter(name => !process.env[name]);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const readJson = path => { const raw = fs.readFileSync(path); return { raw, value: JSON.parse(raw.toString('utf8')) }; };

const output = { audit: 'GHM QuoteFlow legacy identity provenance qualification', version: 1, mutation: false, status: 'BLOCKED_MISSING_EVIDENCE' };

if (missing.length) {
  output.missing_inputs = missing;
  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}

const snapshot = readJson(process.env.GHM_QUOTEFLOW_SOURCE_SNAPSHOT_FILE);
const mapping = readJson(process.env.GHM_LEGACY_USER_RECONCILIATION_FILE);
output.inputs = {
  source_snapshot_sha256: sha256(snapshot.raw),
  reconciliation_sha256: sha256(mapping.raw),
  source_snapshot_path: process.env.GHM_QUOTEFLOW_SOURCE_SNAPSHOT_FILE,
  reconciliation_path: process.env.GHM_LEGACY_USER_RECONCILIATION_FILE,
};

if (snapshot.value.schemaVersion !== 1 || !snapshot.value.sourceSystem || !Array.isArray(snapshot.value.accounts)) {
  output.status = 'BLOCKED_MISSING_EVIDENCE';
  output.reason = 'invalid source snapshot schema';
  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}
if (!Array.isArray(mapping.value.mappings)) {
  output.status = 'BLOCKED_MISSING_EVIDENCE';
  output.reason = 'invalid reconciliation manifest schema';
  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}

const url = process.env.GHM_LEGACY_AUDIT_DATABASE_URL || process.env.GHM_MIGRATOR_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error('Database connection required');
const sslMode = (process.env.DATABASE_SSL ?? 'require').toLowerCase();
const ssl = sslMode === 'disable' ? false : { rejectUnauthorized: sslMode === 'verify-full' };
const client = new Client({ connectionString: url, ssl });
await client.connect();
try {
  const rows = await client.query('SELECT id, email FROM public.users ORDER BY id');
  output.legacy_users = rows.rows.map(row => ({ id: row.id, email_present: Boolean(row.email) }));
  const byId = new Map(rows.rows.map(row => [String(row.id), row]));
  const mappings = mapping.value.mappings;
  const problems = [];
  for (const row of rows.rows) {
    const candidates = mappings.filter(item => String(item.legacyUserId) === String(row.id));
    if (candidates.length !== 1) problems.push({ legacyUserId: row.id, reason: 'mapping-count-not-exactly-one' });
  }
  for (const item of mappings) {
    if (!byId.has(String(item.legacyUserId))) problems.push({ legacyUserId: item.legacyUserId, reason: 'mapping-references-unknown-legacy-user' });
    if (!item.sourceSubject || !item.evidenceReference || !item.reviewedBy || !item.reviewedAt) problems.push({ legacyUserId: item.legacyUserId, reason: 'mapping-missing-required-provenance-fields' });
  }
  const subjects = new Set(snapshot.value.accounts.map(account => String(account.sourceSubject)).filter(Boolean));
  for (const item of mappings) if (!subjects.has(String(item.sourceSubject))) problems.push({ legacyUserId: item.legacyUserId, reason: 'source-subject-not-present-in-authoritative-snapshot' });
  output.mapping_count = mappings.length;
  output.source_account_count = snapshot.value.accounts.length;
  output.problems = problems;
  output.status = problems.length === 0 && rows.rows.length === 2 && mappings.length === 2 ? 'RECONCILED_READ_ONLY' : 'CONFLICT_REQUIRES_REVIEW';
} finally { await client.end(); }
console.log(JSON.stringify(output, null, 2));