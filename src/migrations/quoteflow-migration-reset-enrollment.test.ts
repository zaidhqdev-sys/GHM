import assert from 'node:assert/strict';
import { createQuoteFlowMigrationResetEnrollmentService } from './quoteflow-migration-reset-enrollment.js';

const calls: string[] = [];
const service = createQuoteFlowMigrationResetEnrollmentService({
  async lookupQuoteFlowMigrationResetEnrollment(email) {
    calls.push(email);
    if (email === 'eligible@example.com') return { enrollmentId: 41, accountId: 701 };
    return null;
  },
});

const eligible = await service.lookup(' Eligible@Example.com ');
assert.deepEqual(eligible, { eligible: true, enrollmentId: 41, accountId: 701 });
assert.equal(calls[0], 'eligible@example.com');

const unknown = await service.lookup('unknown@example.com');
assert.deepEqual(unknown, { eligible: false, enrollmentId: null, accountId: null });

console.log('QuoteFlow migration reset-enrollment service qualification: PASS');
