import { Pool } from 'pg';
import 'dotenv/config';
import { ConnectIdentityAdapterImpl } from '../dist/integrations/connect/identity-adapter.js';
import { PostgresAuthPersistence } from '../dist/auth/foundation/persistence.js';

const SANDBOX_DATABASE = 'ghm_payfast_sandbox_db';
const FOUNDER_SUBJECT = 'd31a5c89-b74a-4966-b3e4-11b66be858ec';
const CONNECT_BUSINESS_ID = '01ce0937-e659-442d-a66a-a49b38d81d63';
const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
if (!runtimeUrl) throw new Error('GHM_RUNTIME_DATABASE_URL or DATABASE_URL is required');
const pool = new Pool({ connectionString: runtimeUrl, ssl: { rejectUnauthorized: false } });

try {
  const identity = (await pool.query('SELECT current_database(), session_user, current_user, current_role')).rows[0];
  if (identity.current_database !== SANDBOX_DATABASE ||
      identity.session_user !== 'ghm_runtime' ||
      identity.current_user !== 'ghm_runtime' ||
      identity.current_role !== 'ghm_runtime') {
    throw new Error(`Refusing qualification outside sandbox runtime role/database: ${JSON.stringify(identity)}`);
  }
  console.log('SANDBOX RUNTIME DATABASE/ROLE GUARD PASS');

  const adapter = new ConnectIdentityAdapterImpl(new PostgresAuthPersistence(pool));
  const founder = await adapter.resolve(FOUNDER_SUBJECT, { allowBootstrap: false });
  if (founder.outcome !== 'resolved' || founder.mapping.accountId !== 1) {
    throw new Error('Canonical founder identity mapping did not resolve to sandbox account 1');
  }
  console.log('CONNECT FOUNDER IDENTITY RESOLUTION PASS');

  const business = await pool.query(
    'SELECT * FROM ghm.auth_lookup_business_external_mapping($1, $2)',
    ['supabase', CONNECT_BUSINESS_ID],
  );
  if (business.rowCount !== 1 || Number(business.rows[0].business_id) !== 2) {
    throw new Error('Canonical Connect business mapping did not resolve to sandbox business 2');
  }
  console.log('CANONICAL CONNECT BUSINESS MAPPING PASS');

  const unmapped = await adapter.resolve(crypto.randomUUID(), { allowBootstrap: false });
  if (unmapped.outcome !== 'unmapped' || unmapped.mapping !== null) {
    throw new Error('Unmapped Connect identity did not fail closed');
  }
  console.log('UNMAPPED CONNECT IDENTITY FAIL-CLOSED PASS');

  console.log('RUNTIME CANONICAL MAPPING LOOKUP PASSED WITHOUT DIRECT BUSINESS TABLE ACCESS');
  console.log(JSON.stringify({ status: 'SANDBOX_CONNECT_MAPPING_QUALIFICATION_PASSED', database: identity.current_database, accountId: 1, businessId: 2, productionTouched: false, paymentsEnabled: false }, null, 2));
} finally {
  await pool.end();
}
