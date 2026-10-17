import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileConnectBusiness, type ConnectBusinessReconciliationInput } from './connect-business-migration-reconciliation.js';

const base: ConnectBusinessReconciliationInput = {
  source: { sourceBusinessId: 'legacy-business-001', sourceOwnerSubject: 'legacy-subject-001', evidenceReference: 'snapshot-2026-10-16/business-001' },
  businessMapping: { businessId: 101, evidenceReference: 'snapshot-2026-10-16/business-001' },
  reviewedBusinessMapping: { businessId: 101, evidenceReference: 'snapshot-2026-10-16/business-001' },
  ownerMapping: { accountId: 202, evidenceReference: 'snapshot-2026-10-16/business-001' },
  activeOwnerMembership: true,
};

test('maps only exact business and owner evidence with active owner membership', () => {
  assert.deepEqual(reconcileConnectBusiness(base), { sourceBusinessId: 'legacy-business-001', outcome: 'MAPPED', targetBusinessId: 101, targetOwnerAccountId: 202, reasonCode: 'EXACT_BUSINESS_OWNER_AND_ACTIVE_MEMBERSHIP' });
});
test('blocks missing source ID, owner subject, or evidence', () => {
  assert.equal(reconcileConnectBusiness({ ...base, source: { ...base.source, evidenceReference: '' } }).reasonCode, 'SOURCE_BUSINESS_OWNER_AND_EVIDENCE_REQUIRED');
  assert.equal(reconcileConnectBusiness({ ...base, source: { ...base.source, sourceOwnerSubject: '' } }).outcome, 'BLOCKED');
});
test('requires explicit canonical business mapping and does not auto-create', () => {
  const result = reconcileConnectBusiness({ ...base, businessMapping: null, reviewedBusinessMapping: null });
  assert.equal(result.outcome, 'CREATE_REQUIRED');
  assert.equal(result.targetBusinessId, null);
});
test('accepts a reviewed business mapping when no pre-existing exact mapping exists', () => {
  const result = reconcileConnectBusiness({ ...base, businessMapping: null });
  assert.equal(result.outcome, 'MAPPED');
  assert.equal(result.targetBusinessId, 101);
});

test('blocks missing canonical owner mapping', () => {
  assert.equal(reconcileConnectBusiness({ ...base, ownerMapping: null }).reasonCode, 'EXPLICIT_CANONICAL_OWNER_MAPPING_REQUIRED');
});
test('rejects conflicting reviewed business mappings', () => {
  const result = reconcileConnectBusiness({ ...base, reviewedBusinessMapping: { businessId: 999, evidenceReference: base.source.evidenceReference } });
  assert.equal(result.outcome, 'CONFLICT');
  assert.equal(result.reasonCode, 'BUSINESS_MAPPING_REVIEW_CONFLICT');
});
test('rejects owner mapping with different evidence', () => {
  const result = reconcileConnectBusiness({ ...base, ownerMapping: { accountId: 202, evidenceReference: 'different-snapshot' } });
  assert.equal(result.outcome, 'CONFLICT');
  assert.equal(result.reasonCode, 'OWNER_MAPPING_EVIDENCE_CONFLICT');
});
test('blocks when active owner membership is not proven', () => {
  const result = reconcileConnectBusiness({ ...base, activeOwnerMembership: false });
  assert.equal(result.outcome, 'BLOCKED');
  assert.equal(result.reasonCode, 'ACTIVE_OWNER_MEMBERSHIP_NOT_PROVEN');
});
test('blocks invalid canonical numeric identifiers or absent mapping evidence', () => {
  assert.equal(reconcileConnectBusiness({ ...base, businessMapping: { businessId: 0, evidenceReference: 'evidence' } }).outcome, 'BLOCKED');
  assert.equal(reconcileConnectBusiness({ ...base, ownerMapping: { accountId: 202, evidenceReference: '' } }).outcome, 'BLOCKED');
});
test('is deterministic and has no name/email auto-matching input', () => {
  assert.deepEqual(reconcileConnectBusiness(base), reconcileConnectBusiness(base));
  assert.equal('name' in base.source, false);
  assert.equal('email' in base.source, false);
});
