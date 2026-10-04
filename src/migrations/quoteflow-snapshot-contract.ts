export type SnapshotEnvironment = 'non_production';
export type MigrationOutcome = 'MIGRATED' | 'RESET_REQUIRED' | 'CONFLICT' | 'BLOCKED';

export interface SnapshotEvidence {
  sourceSystem: 'supabase';
  extractionMechanism: string;
  extractionTimestamp: string;
  datasetVersion: string;
  evidenceReference: string;
  environment: SnapshotEnvironment;
  recordCounts: { accounts: number; organizations: number; memberships: number };
}
export interface SourceAccount { sourceSubject: string; status: string; email?: string | null; createdAt?: string | null; updatedAt?: string | null }
export interface SourceOrganization { sourceOrganizationId: string; name: string; ownerSourceSubject: string; evidenceReference: string }
export interface SourceMembership { sourceOrganizationId: string; sourceSubject: string; sourceRole: string; status: string }
export interface QuoteFlowMigrationSnapshot { schemaVersion: 1; evidence: SnapshotEvidence; accounts: SourceAccount[]; organizations: SourceOrganization[]; memberships: SourceMembership[] }
export interface AccountResolution { sourceSubject: string; targetAccountId: number | null; externalMappingOutcome: 'created' | 'already_linked' | 'conflict' | 'account_not_found'; credentialDisposition: 'migrate_verified_hash' | 'reset_required' | 'blocked'; reviewedBy?: string | null; reviewedAt?: string | null }
export interface OrganizationResolution { sourceOrganizationId: string; outcome: 'MAPPED' | 'CREATE_REQUIRED' | 'CONFLICT' | 'BLOCKED'; targetBusinessId: number | null; reviewedBy?: string | null; reviewedAt?: string | null }
export interface MigrationManifest { schemaVersion: 1; sourceEvidence: SnapshotEvidence; accounts: Array<Record<string, unknown>>; organizations: Array<Record<string, unknown>> }

export class MigrationSnapshotValidationError extends Error {
  constructor(readonly issues: string[]) { super('QuoteFlow migration snapshot validation failed'); this.name = 'MigrationSnapshotValidationError'; }
}
const isUuid = (value: string): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const normalizeEmail = (email: string | null | undefined): string | null => { if (!email) return null; const value = email.trim().toLowerCase(); return value || null; };

export function validateMigrationSnapshot(snapshot: QuoteFlowMigrationSnapshot): void {
  const issues: string[] = [];
  if (snapshot.schemaVersion !== 1) issues.push('SCHEMA_VERSION_UNSUPPORTED');
  if (snapshot.evidence.sourceSystem !== 'supabase') issues.push('SOURCE_SYSTEM_UNSUPPORTED');
  if (snapshot.evidence.environment !== 'non_production') issues.push('SOURCE_ENVIRONMENT_NOT_NON_PRODUCTION');
  const accountIds = new Set<string>();
  for (const [i, account] of snapshot.accounts.entries()) {
    if (!isUuid(account.sourceSubject)) issues.push(`ACCOUNT_${i}_INVALID_UUID`);
    if (accountIds.has(account.sourceSubject)) issues.push(`ACCOUNT_${i}_DUPLICATE_UUID`);
    accountIds.add(account.sourceSubject);
    if (!nonEmpty(account.status)) issues.push(`ACCOUNT_${i}_MISSING_STATUS`);
  }
  const organizationIds = new Set<string>();
  for (const [i, org] of snapshot.organizations.entries()) {
    if (!nonEmpty(org.sourceOrganizationId)) issues.push(`ORGANIZATION_${i}_MISSING_ID`);
    if (organizationIds.has(org.sourceOrganizationId)) issues.push(`ORGANIZATION_${i}_DUPLICATE_ID`);
    organizationIds.add(org.sourceOrganizationId);
    if (!nonEmpty(org.ownerSourceSubject) || !accountIds.has(org.ownerSourceSubject)) issues.push(`ORGANIZATION_${i}_OWNER_NOT_IN_SNAPSHOT`);
    if (!nonEmpty(org.evidenceReference)) issues.push(`ORGANIZATION_${i}_MISSING_EVIDENCE`);
  }
  for (const [i, membership] of snapshot.memberships.entries()) {
    if (!organizationIds.has(membership.sourceOrganizationId)) issues.push(`MEMBERSHIP_${i}_UNKNOWN_ORGANIZATION`);
    if (!accountIds.has(membership.sourceSubject)) issues.push(`MEMBERSHIP_${i}_UNKNOWN_ACCOUNT`);
    if (!nonEmpty(membership.sourceRole)) issues.push(`MEMBERSHIP_${i}_MISSING_ROLE`);
    if (!nonEmpty(membership.status)) issues.push(`MEMBERSHIP_${i}_MISSING_STATUS`);
  }
  if (snapshot.evidence.recordCounts.accounts !== snapshot.accounts.length) issues.push('ACCOUNT_COUNT_MISMATCH');
  if (snapshot.evidence.recordCounts.organizations !== snapshot.organizations.length) issues.push('ORGANIZATION_COUNT_MISMATCH');
  if (snapshot.evidence.recordCounts.memberships !== snapshot.memberships.length) issues.push('MEMBERSHIP_COUNT_MISMATCH');
  if (issues.length) throw new MigrationSnapshotValidationError(issues);
}

export function generateDryRunManifest(snapshot: QuoteFlowMigrationSnapshot, resolutions: AccountResolution[], organizationResolutions: OrganizationResolution[]): MigrationManifest {
  validateMigrationSnapshot(snapshot);
  const byAccount = new Map(resolutions.map((r) => [r.sourceSubject, r]));
  const byOrg = new Map(organizationResolutions.map((r) => [r.sourceOrganizationId, r]));
  const accounts = snapshot.accounts.map((account) => {
    const r = byAccount.get(account.sourceSubject);
    let migrationOutcome: MigrationOutcome = 'BLOCKED';
    let reasonCode = 'GHM_ACCOUNT_RESOLUTION_REQUIRED';
    if (r?.externalMappingOutcome === 'conflict') { migrationOutcome = 'CONFLICT'; reasonCode = 'EXTERNAL_MAPPING_CONFLICT'; }
    else if (!r || r.externalMappingOutcome === 'account_not_found' || r.targetAccountId === null) { migrationOutcome = 'BLOCKED'; reasonCode = 'GHM_ACCOUNT_NOT_RESOLVED'; }
    else if (r.credentialDisposition === 'blocked') { migrationOutcome = 'BLOCKED'; reasonCode = 'CREDENTIAL_MIGRATION_BLOCKED'; }
    else if (r.credentialDisposition === 'reset_required') { migrationOutcome = 'RESET_REQUIRED'; reasonCode = 'CREDENTIAL_RESET_REQUIRED'; }
    else { migrationOutcome = 'MIGRATED'; reasonCode = 'READY_FOR_EXECUTION_QUALIFICATION'; }
    return { sourceProvider: 'supabase', sourceSubject: account.sourceSubject, sourceEmail: account.email ?? null, normalizedEmail: normalizeEmail(account.email), targetAccountId: r?.targetAccountId ?? null, externalMappingOutcome: r?.externalMappingOutcome ?? 'account_not_found', credentialDisposition: r?.credentialDisposition ?? 'blocked', migrationOutcome, reasonCode, sourceEvidence: snapshot.evidence.evidenceReference, reviewedAt: r?.reviewedAt ?? null, reviewedBy: r?.reviewedBy ?? null };
  });
  const organizations = snapshot.organizations.map((org) => {
    const r = byOrg.get(org.sourceOrganizationId);
    const outcome = r?.outcome ?? 'BLOCKED';
    return { sourceOrganizationId: org.sourceOrganizationId, outcome, targetBusinessId: r?.targetBusinessId ?? null, reasonCode: outcome === 'MAPPED' ? 'BUSINESS_MAPPING_REVIEWED' : outcome === 'CREATE_REQUIRED' ? 'BUSINESS_CREATE_REQUIRED' : outcome === 'CONFLICT' ? 'BUSINESS_MAPPING_CONFLICT' : 'BUSINESS_RESOLUTION_REQUIRED', sourceEvidence: org.evidenceReference, reviewedAt: r?.reviewedAt ?? null, reviewedBy: r?.reviewedBy ?? null };
  });
  return { schemaVersion: 1, sourceEvidence: snapshot.evidence, accounts, organizations };
}