// Shared test environment preload for `npm test`.
// Load local qualification environment first so database-backed tests can use
// the configured runtime/migrator separation; only fall back to safe defaults
// when those values are genuinely absent.
require('dotenv/config');

process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgres://qualification:test@localhost:5432/ghm';
process.env.INVITE_CODE ??= 'test-invite-code';
process.env.CORS_ORIGINS ??= 'http://localhost:3000';

process.env.PAYFAST_MERCHANT_ID ??= '10000100';
process.env.PAYFAST_PASSPHRASE ??= 'secret';
