// Shared test environment preload for `npm test`.
// Keeps tests self-contained without requiring production credentials.
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgres://qualification:test@localhost:5432/ghm';
process.env.INVITE_CODE ??= 'test-invite-code';
process.env.CORS_ORIGINS ??= 'http://localhost:3000';
