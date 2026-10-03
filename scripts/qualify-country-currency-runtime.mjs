import { Pool } from 'pg';
import 'dotenv/config';

const runtimeUrl = process.env.GHM_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const migratorUrl = process.env.GHM_MIGRATOR_DATABASE_URL;
if (!runtimeUrl || !migratorUrl) throw new Error('Missing GHM runtime/migrator database URLs');
if (runtimeUrl === migratorUrl) throw new Error('Runtime and migrator connections must be distinct');

const ssl = { rejectUnauthorized: false };
const runtimePool = new Pool({ connectionString: runtimeUrl, ssl });
const cleanupPool = new Pool({ connectionString: migratorUrl, ssl });

const assertRejected = async (work, label) => {
  try { await work(); }
  catch (error) {
    if (!String(error?.message).toLowerCase().includes('permission denied')) throw new Error(`${label}: unexpected error: ${error?.message}`);
    console.log(`${label}: PASS`);
    return;
  }
  throw new Error(`${label}: operation unexpectedly succeeded`);
};

try {
  const identity = (await runtimePool.query('SELECT current_database(), session_user, current_user, current_role')).rows[0];
  if (identity.current_database !== 'ghm_db' || identity.session_user !== 'ghm_runtime' || identity.current_user !== 'ghm_runtime' || identity.current_role !== 'ghm_runtime') {
    throw new Error(`Unexpected runtime identity: ${JSON.stringify(identity)}`);
  }

  const reference = (await runtimePool.query(`
    SELECT c.code AS country_code, c.code_alpha3, c.name AS country_name,
           cur.code AS currency_code, cur.name AS currency_name, cur.symbol, cur.minor_unit
    FROM ghm.country c
    JOIN ghm.currency cur ON cur.id = c.default_currency_id
    WHERE c.code = 'ZA' AND cur.code = 'ZAR'
  `)).rows;

  if (reference.length !== 1) throw new Error(`Expected exactly one ZA/ZAR reference mapping, received ${reference.length}`);
  if (reference[0].country_code !== 'ZA' || reference[0].code_alpha3 !== 'ZAF' || reference[0].currency_code !== 'ZAR' || reference[0].minor_unit !== 2) {
    throw new Error(`Unexpected ZA/ZAR reference mapping: ${JSON.stringify(reference[0])}`);
  }
  console.log('ZA/ZAR REFERENCE READ PASS');

  const privileges = (await runtimePool.query(`
    SELECT
      has_table_privilege(current_user,'ghm.country','SELECT') AS country_select,
      has_table_privilege(current_user,'ghm.country','INSERT') AS country_insert,
      has_table_privilege(current_user,'ghm.country','UPDATE') AS country_update,
      has_table_privilege(current_user,'ghm.country','DELETE') AS country_delete,
      has_table_privilege(current_user,'ghm.currency','SELECT') AS currency_select,
      has_table_privilege(current_user,'ghm.currency','INSERT') AS currency_insert,
      has_table_privilege(current_user,'ghm.currency','UPDATE') AS currency_update,
      has_table_privilege(current_user,'ghm.currency','DELETE') AS currency_delete,
      has_sequence_privilege(current_user,'ghm.country_id_seq','USAGE') AS country_seq_usage,
      has_sequence_privilege(current_user,'ghm.currency_id_seq','USAGE') AS currency_seq_usage
  `)).rows[0];

  if (!privileges.country_select || privileges.country_insert || privileges.country_update || privileges.country_delete ||
      !privileges.currency_select || privileges.currency_insert || privileges.currency_update || privileges.currency_delete ||
      privileges.country_seq_usage || privileges.currency_seq_usage) {
    throw new Error(`Unexpected runtime reference privileges: ${JSON.stringify(privileges)}`);
  }
  console.log('RUNTIME REFERENCE PRIVILEGE PASS');

  await assertRejected(() => runtimePool.query("INSERT INTO ghm.currency (code,name,symbol) VALUES ('ZZZ','Forbidden','F')"), 'RUNTIME CURRENCY INSERT DENIAL');
  await assertRejected(() => runtimePool.query("UPDATE ghm.country SET name='Forbidden' WHERE code='ZA'"), 'RUNTIME COUNTRY UPDATE DENIAL');
  await assertRejected(() => runtimePool.query("DELETE FROM ghm.currency WHERE code='ZAR'"), 'RUNTIME CURRENCY DELETE DENIAL');

  const client = await cleanupPool.connect();
  try {
    await client.query('SET ROLE ghm_schema_owner');
    const fks = (await client.query(`
      SELECT tc.table_name, kcu.column_name, ccu.table_name AS referenced_table, ccu.column_name AS referenced_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.constraint_schema = kcu.constraint_schema
      JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.constraint_schema = ccu.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.constraint_schema = 'ghm'
        AND ccu.table_name IN ('country','currency')
      ORDER BY ccu.table_name, tc.table_name, kcu.column_name
    `)).rows;
    if (fks.length < 6) throw new Error(`Expected established country/currency FK graph; received ${fks.length}`);
    console.log('COUNTRY/CURRENCY FK GRAPH PASS');
  } finally {
    client.release();
  }

  console.log('GHM COUNTRY/CURRENCY RUNTIME QUALIFICATION: PASS');
} finally {
  await runtimePool.end();
  await cleanupPool.end();
}
