import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';

const snapshotPath = process.env.GHM_QUOTEFLOW_SOURCE_SNAPSHOT_FILE;
const mappingPath = process.env.GHM_LEGACY_USER_RECONCILIATION_FILE;
const databaseUrl = process.env.GHM_LEGACY_AUDIT_DATABASE_URL;

const output = (value) => console.log(JSON.stringify(value, null, 2));

if (!databaseUrl || !snapshotPath || !mappingPath) {
  output({
    audit: 'GHM legacy user identity provenance reconciliation',
    version: 1,
    mutation: false,
    status: 'BLOCKED_RECONCILIATION_INPUT_REQUIRED',
    required_environment: [
      'GHM_LEGACY_AUDIT_DATABASE_URL',
      'GHM_QUOTEFLOW_SOURCE_SNAPSHOT_FILE',
      'GHM_LEGACY_USER_RECONCILIATION_FILE',
    ],
    reason: 'Legacy public.users has no authoritative Supabase Auth UUID. Reconciliation requires an approved source snapshot and an explicit operator-reviewed legacy-user-to-source-subject mapping. Email-only matching is prohibited.',
    decision: 'DISPOSITION_PENDING',
  });
  process.exit(0);
}

const readJson = async (path) => JSON.parse(await fs.readFile(path, 'utf8'));
const sha256 = async (path) => {
  const bytes = await fs.readFile(path);
  return createHash('sha256').update(bytes).digest('hex');
};

const snapshot = await readJson(snapshotPath);
const mapping = await readJson(mappingPath);

const issues = [];
if (snapshot?.schemaVersion !== 1) issues.push('SOURCE_SNAPSHOT_SCHEMA_UNSUPPORTED');
if (snapshot?.evidence?.sourceSystem !== 'supabase') issues.push('SOURCE_SNAPSHOT_SOURCE_UNSUPPORTED');
if (snapshot?.evidence?.environment !== 'non_production') issues.push('SOURCE_SNAPSHOT_NOT_NON_PRODUCTION');
if (!snapshot?.evidence?.evidenceReference) issues.push('SOURCE_SNAPSHOT_EVIDENCE_REFERENCE_MISSING');

const accounts = Array.isArray(snapshot?.accounts) ? snapshot.accounts : [];
const accountBySubject = new Map(accounts.map((account) => [account.sourceSubject, account]));
const mappings = Array.isArray(mapping?.mappings) ? mapping.mappings : [];
const seenLegacyIds = new Set();
const seenSubjects = new Set();

for (const [index, row] of mappings.entries()) {
  const legacyUserId = Number(row?.legacyUserId);
  const sourceSubject = row?.sourceSubject;
  if (!Number.isInteger(legacyUserId) || legacyUserId <= 0) issues.push(`MAPPING_${index}_INVALID_LEGACY_USER_ID`);
  if (seenLegacyIds.has(legacyUserId)) issues.push(`MAPPING_${index}_DUPLICATE_LEGACY_USER_ID`);
  seenLegacyIds.add(legacyUserId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(sourceSubject))) {
    issues.push(`MAPPING_${index}_INVALID_SOURCE_SUBJECT`);
  }
  if (seenSubjects.has(sourceSubject)) issues.push(`MAPPING_${index}_DUPLICATE_SOURCE_SUBJECT`);
  seenSubjects.add(sourceSubject);
  if (!accountBySubject.has(sourceSubject)) issues.push(`MAPPING_${index}_SOURCE_SUBJECT_NOT_IN_SNAPSHOT`);
  if (!row?.evidenceReference) issues.push(`MAPPING_${index}_EVIDENCE_REFERENCE_MISSING`);
  if (!row?.reviewedBy || !row?.reviewedAt) issues.push(`MAPPING_${index}_REVIEW_ATTESTATION_MISSING`);
}

if (snapshot?.evidence?.recordCounts?.accounts !== accounts.length) issues.push('SOURCE_ACCOUNT_COUNT_MISMATCH');
if (snapshot?.evidence?.recordCounts?.accounts !== undefined && mappings.length > snapshot.evidence.recordCounts.accounts) {
  issues.push('MAPPING_COUNT_EXCEEDS_SOURCE_ACCOUNT_COUNT');
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

try {
  const users = await pool.query(`
    SELECT id, email
    FROM public.users
    ORDER BY id
  `);

  const userIds = new Set(users.rows.map((row) => Number(row.id)));
  for (const [index, row] of mappings.entries()) {
    if (!userIds.has(Number(row.legacyUserId))) issues.push(`MAPPING_${index}_LEGACY_USER_NOT_FOUND`);
  }

  const normalizedSourceEmails = new Map();
  for (const account of accounts) {
    if (account.email) normalizedSourceEmails.set(String(account.sourceSubject), String(account.email).trim().toLowerCase());
  }

  const reconciliations = users.rows.map((user) => {
    const row = mappings.find((candidate) => Number(candidate.legacyUserId) === Number(user.id));
    if (!row) {
      return {
        legacyUserId: Number(user.id),
        outcome: 'BLOCKED',
        reasonCode: 'EXPLICIT_SOURCE_MAPPING_REQUIRED',
      };
    }

    const sourceAccount = accountBySubject.get(row.sourceSubject);
    const legacyEmail = String(user.email).trim().toLowerCase();
    const sourceEmail = sourceAccount?.email ? String(sourceAccount.email).trim().toLowerCase() : null;
    const emailCorroboration = sourceEmail === null
      ? 'SOURCE_EMAIL_UNAVAILABLE'
      : sourceEmail === legacyEmail
        ? 'MATCH'
        : 'MISMATCH';

    return {
      legacyUserId: Number(user.id),
      sourceSubject: row.sourceSubject,
      outcome: emailCorroboration === 'MISMATCH' ? 'CONFLICT' : 'PROVENANCE_RECONCILED',
      reasonCode: emailCorroboration === 'MISMATCH'
        ? 'SOURCE_EMAIL_CORROBORATION_MISMATCH'
        : 'EXPLICIT_SOURCE_MAPPING_REVIEWED',
      emailCorroboration,
      sourceEvidence: snapshot.evidence.evidenceReference,
      mappingEvidence: row.evidenceReference,
      reviewedBy: row.reviewedBy,
      reviewedAt: row.reviewedAt,
    };
  });

  const status = issues.length ? 'BLOCKED' : reconciliations.some((row) => row.outcome === 'CONFLICT') ? 'CONFLICT_REQUIRES_REVIEW' : 'RECONCILED_READ_ONLY';

  output({
    audit: 'GHM legacy user identity provenance reconciliation',
    version: 1,
    mutation: false,
    status,
    source_snapshot: {
      sha256: await sha256(snapshotPath),
      evidence_reference: snapshot.evidence?.evidenceReference ?? null,
      dataset_version: snapshot.evidence?.datasetVersion ?? null,
      environment: snapshot.evidence?.environment ?? null,
      account_count: accounts.length,
    },
    mapping_manifest: {
      sha256: await sha256(mappingPath),
      mapping_count: mappings.length,
    },
    legacy_users: {
      row_count: users.rows.length,
    },
    reconciliations,
    issues,
    authorization: {
      migration_authorized: false,
      account_creation_authorized: false,
      external_identity_link_authorized: false,
      credential_migration_authorized: false,
      email_only_matching_used: false,
    },
    decision: 'DISPOSITION_PENDING',
  });
} finally {
  await pool.end();
}
