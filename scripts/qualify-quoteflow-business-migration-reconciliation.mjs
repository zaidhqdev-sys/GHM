import assert from 'node:assert/strict';

type Outcome = 'MAPPED' | 'CREATE_REQUIRED' | 'CONFLICT' | 'BLOCKED';

interface SourceOrg {
  sourceOrganizationId: string;
  name: string;
  ownerSourceSubject: string;
  evidenceReference: string;
}

interface Resolution {
  sourceOrganizationId: string;
  outcome: Outcome;
  targetBusinessId: number | null;
  reasonCode: string;
}

function reconcile(
  org: SourceOrg,
  exactMapping: { businessId: number } | null,
  reviewedTarget: { businessId: number; evidenceReference: string } | null,
): Resolution {
  if (!org.sourceOrganizationId.trim() || !org.evidenceReference.trim()) {
    return { sourceOrganizationId: org.sourceOrganizationId, outcome: 'BLOCKED', targetBusinessId: null, reasonCode: 'BUSINESS_RESOLUTION_EVIDENCE_REQUIRED' };
  }
  if (exactMapping) {
    if (reviewedTarget && reviewedTarget.businessId !== exactMapping.businessId) {
      return { sourceOrganizationId: org.sourceOrganizationId, outcome: 'CONFLICT', targetBusinessId: exactMapping.businessId, reasonCode: 'BUSINESS_MAPPING_CONFLICT' };
    }
    return { sourceOrganizationId: org.sourceOrganizationId, outcome: 'MAPPED', targetBusinessId: exactMapping.businessId, reasonCode: 'BUSINESS_MAPPING_EXACT' };
  }
  if (reviewedTarget) {
    if (reviewedTarget.evidenceReference !== org.evidenceReference) {
      return { sourceOrganizationId: org.sourceOrganizationId, outcome: 'CONFLICT', targetBusinessId: reviewedTarget.businessId, reasonCode: 'BUSINESS_EVIDENCE_CONFLICT' };
    }
    return { sourceOrganizationId: org.sourceOrganizationId, outcome: 'MAPPED', targetBusinessId: reviewedTarget.businessId, reasonCode: 'BUSINESS_MAPPING_REVIEWED' };
  }
  return { sourceOrganizationId: org.sourceOrganizationId, outcome: 'CREATE_REQUIRED', targetBusinessId: null, reasonCode: 'BUSINESS_CREATE_REQUIRED' };
}

const base: SourceOrg = {
  sourceOrganizationId: 'org-legacy-001',
  name: 'Example Business',
  ownerSourceSubject: 'legacy-user-001',
  evidenceReference: 'snapshot-001/org-001',
};

assert.deepEqual(reconcile(base, { businessId: 501 }, null), {
  sourceOrganizationId: 'org-legacy-001',
  outcome: 'MAPPED',
  targetBusinessId: 501,
  reasonCode: 'BUSINESS_MAPPING_EXACT',
});

assert.deepEqual(reconcile(base, null, null), {
  sourceOrganizationId: 'org-legacy-001',
  outcome: 'CREATE_REQUIRED',
  targetBusinessId: null,
  reasonCode: 'BUSINESS_CREATE_REQUIRED',
});

assert.equal(reconcile(base, { businessId: 501 }, { businessId: 502, evidenceReference: base.evidenceReference }).outcome, 'CONFLICT');
assert.equal(reconcile({ ...base, evidenceReference: '' }, null, null).outcome, 'BLOCKED');
assert.equal(reconcile(base, null, { businessId: 501, evidenceReference: 'other-evidence' }).outcome, 'CONFLICT');

// Name/email candidates are deliberately absent from the resolution API.
const first = reconcile(base, { businessId: 501 }, null);
const second = reconcile(base, { businessId: 501 }, null);
assert.deepEqual(first, second);

console.log('QuoteFlow Business migration reconciliation qualification: PASS');
console.log(JSON.stringify({ outcomes: ['MAPPED', 'CREATE_REQUIRED', 'CONFLICT', 'BLOCKED'], mutation: false, emailOrNameMatching: false }));
