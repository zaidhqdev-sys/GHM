// Shared test environment preload for `npm test`.
// Mirrors values used by src/auth/request-context.test.ts.
// Does not invent production secrets; only fills gaps for local qualification.
process.env.NODE_ENV ??= 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-for-qualification';
process.env.DATABASE_URL ??= 'postgres://qualification:test@localhost:5432/ghm';
process.env.INVITE_CODE ??= 'test-invite-code';
process.env.CORS_ORIGINS ??= 'http://localhost:3000';
