/**
 * Text that PostgreSQL can store. The Tender AI contract (Zod) accepts any JavaScript string, but
 * PostgreSQL cannot hold U+0000 in `text` or `jsonb`, and a lone UTF-16 surrogate is not valid
 * UTF-8 (the driver would replace it, and `jsonb` input refuses it). A string like that would pass
 * the contract and then fail inside the database as an error the Gateway maps to 503. GHM is the
 * authoritative validator (owner decisions Q8-Q10), so it refuses such text up front as `invalid`.
 * This is deliberately STRICTER than the Tender AI contract and is recorded as a reviewed
 * difference in docs/TENDER_AI_CONTRACT_PARITY.md. Nothing is stripped or replaced.
 */
const UNSTORABLE = /\u0000|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

export const isStorableText = (s: string): boolean => !UNSTORABLE.test(s);
