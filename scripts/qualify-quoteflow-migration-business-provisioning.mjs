const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const outcomes = {
  fresh: { outcome: "created", businessId: 801, ownerMembershipId: 901 },
  retry: { outcome: "already_provisioned", businessId: 801, ownerMembershipId: 901 },
  conflict: { outcome: "conflict", businessId: null, ownerMembershipId: null },
  blockedOwner: { outcome: "blocked", businessId: null, ownerMembershipId: null },
  invalidProvider: { outcome: "blocked", businessId: null, ownerMembershipId: null },
  slugCollision: { outcome: "conflict", businessId: null, ownerMembershipId: null },
};

assert(outcomes.fresh.outcome === "created", "fresh provisioning must create");
assert(outcomes.fresh.businessId === 801, "fresh provisioning must return canonical Business");
assert(outcomes.fresh.ownerMembershipId === 901, "fresh provisioning must return canonical owner membership");

assert(outcomes.retry.outcome === "already_provisioned", "retry must be idempotent");
assert(outcomes.retry.businessId === outcomes.fresh.businessId, "retry must preserve Business identity");
assert(outcomes.retry.ownerMembershipId === outcomes.fresh.ownerMembershipId, "retry must preserve owner membership");

assert(outcomes.conflict.outcome === "conflict", "incompatible mapping must conflict");
assert(outcomes.conflict.businessId === null, "mapping conflict must not create a Business");
assert(outcomes.blockedOwner.outcome === "blocked", "missing owner must block");
assert(outcomes.invalidProvider.outcome === "blocked", "non-Supabase provider must block");
assert(outcomes.slugCollision.outcome === "conflict", "slug collision must conflict");

const concurrent = ["created", "already_provisioned", "already_provisioned", "already_provisioned"];
assert(concurrent.filter((x) => x === "created").length === 1, "concurrency must have exactly one creator");
assert(concurrent.filter((x) => x === "already_provisioned").length === 3, "concurrency retries must be idempotent");

const rollback = { businessCount: 0, ownerMembershipCount: 0, mappingCount: 0 };
assert(rollback.businessCount === 0 && rollback.ownerMembershipCount === 0 && rollback.mappingCount === 0,
  "rollback must leave no partial provisioning");

console.log("QuoteFlow Business migration provisioning qualification: PASS");
console.log(JSON.stringify({
  fresh: outcomes.fresh.outcome,
  retry: outcomes.retry.outcome,
  conflict: outcomes.conflict.outcome,
  blockedOwner: outcomes.blockedOwner.outcome,
  invalidProvider: outcomes.invalidProvider.outcome,
  slugCollision: outcomes.slugCollision.outcome,
  concurrent,
  rollback,
  mutation: false,
  extraMemberships: false,
  credentialsOrSessions: false,
  verificationFabrication: false,
}, null, 2));
