import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import 'dotenv/config';

const migrator = new Client({ connectionString: process.env.GHM_MIGRATOR_DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
const gateway = new Client({ connectionString: process.env.GHM_ACTOR_GATEWAY_DATABASE_URL, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
const secret = Buffer.from(process.env.GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET ?? '', 'base64');
assert.equal(secret.length, 32, 'CI-only Actor Gateway HMAC secret must be 32 bytes');
function sign(actor, operation, context, issued = Math.floor(Date.now()/1000), nonce = randomUUID()) {
  const contextText = JSON.stringify(context);
  const payload = ['ghm-actor-gateway:v2',String(actor),operation,String(issued),nonce,Buffer.from(contextText).toString('hex')].join('|');
  return { actor, issued, nonce, contextText, signature:createHmac('sha256',secret).update(payload).digest('hex') };
}
async function denied(promise, pattern, label) { await assert.rejects(promise, pattern, label); }
const authoritySql = 'SELECT * FROM ghm.gateway_manage_commercial_document_approval_authority($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)';
const approvalSql = 'SELECT * FROM ghm.gateway_approve_commercial_document_version($1,$2,$3,$4,$5,$6,$7)';
const paymentSql = 'SELECT * FROM ghm.gateway_prepare_commercial_payment_with_consent($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)';
await migrator.connect(); await gateway.connect();
try {
  await migrator.query('SET ROLE ghm_schema_owner');
  const createdFounder = await migrator.query(
    'SELECT account_id FROM ghm.auth_create_account($1,$2,$3,$4,$5,$6,$7,$8)',
    ['CI Synthetic Founder','customer','zaidhqdev@gmail.com','zaidhqdev@gmail.com',
      '$argon2id$ci-fixture-only-not-a-real-credential',19456,2,1]);
  assert.equal(createdFounder.rowCount,1,'synthetic founder account must be created in disposable CI');
  const promotedFounder = await migrator.query(
    'SELECT account_id FROM ghm.auth_bootstrap_founder_system_admin($1)',
    ['zaidhqdev@gmail.com']);
  const actor = Number(promotedFounder.rows[0].account_id);
  assert.equal(actor,Number(createdFounder.rows[0].account_id));
  const b = await migrator.query("INSERT INTO ghm.business(name,slug,verification_status,is_active) VALUES('CI Commercial Workflow Business','ci-commercial-workflow-business','approved',true) RETURNING id");
  const business = Number(b.rows[0].id);
  await migrator.query("INSERT INTO ghm.business_membership(business_id,account_id,membership_role,membership_status,created_by) VALUES($1,$2,'owner','active',$2)",[business,actor]);
  const ref = await migrator.query("SELECT c.id country_id,cur.id currency_id FROM ghm.country c JOIN ghm.currency cur ON cur.code='ZAR' WHERE c.code='ZA'");
  assert.equal(ref.rowCount,1);
  const country=Number(ref.rows[0].country_id), currency=Number(ref.rows[0].currency_id);
  const p=await migrator.query("INSERT INTO ghm.commercial_plan(code,name,lifecycle_status) VALUES('ci_commercial_test','CI Commercial Test','active') RETURNING id");
  const v=await migrator.query("INSERT INTO ghm.commercial_plan_version(plan_id,version,trial_days,effective_from,lifecycle_status) VALUES($1,1,0,now()-interval '1 day','active') RETURNING id",[p.rows[0].id]);
  const price=await migrator.query("INSERT INTO ghm.commercial_plan_price(plan_version_id,country_id,currency_id,price_kind,amount_minor_units,billing_interval,effective_from,lifecycle_status) VALUES($1,$2,$3,'standard',2500,'month',now()-interval '1 day','active') RETURNING id",[v.rows[0].id,country,currency]);
  const sub=await migrator.query("INSERT INTO ghm.commercial_subscription(business_id,plan_version_id,price_id,lifecycle_status) VALUES($1,$2,$3,'trialing') RETURNING id",[business,v.rows[0].id,price.rows[0].id]);
  const d=await migrator.query("INSERT INTO ghm.commercial_document_version(document_type,document_key,version,title,content_sha256,jurisdiction_country_id,plan_code) VALUES('subscription_terms','ci_subscription_terms','ci-v1','Synthetic CI terms',repeat('a',64),$1,'ci_commercial_test') RETURNING id",[country]);
  const document=Number(d.rows[0].id);
  await migrator.query("INSERT INTO ghm.commercial_document_status_event(document_version_id,status,source,reason) VALUES($1,'draft','ci_qualification','Synthetic fixture')",[document]);
  const identity=await gateway.query('SELECT session_user,current_user');
  assert.equal(identity.rows[0].session_user,'ghm_actor_gateway');
  assert.equal(identity.rows[0].current_user,'ghm_actor_gateway');

  const scope={action:'grant',documentType:'subscription_terms',documentKey:'ci_subscription_terms',jurisdictionCountryId:country,reason:'Synthetic CI authority grant'};
  const g=sign(actor,'commercial.document.authority.manage',scope);
  const gargs=[g.actor,g.issued,g.nonce,g.contextText,g.signature,scope.action,scope.documentType,scope.documentKey,country,scope.reason];
  const grant=await gateway.query(authoritySql,gargs);
  assert.equal(grant.rows[0].event_type,'granted');
  await denied(gateway.query(authoritySql,gargs),/replay detected/i,'authority assertion replay');
  const forged=sign(actor,'commercial.document.authority.manage',scope);
  await denied(gateway.query(authoritySql,[forged.actor,forged.issued,forged.nonce,forged.contextText,'0'.repeat(64),scope.action,scope.documentType,scope.documentKey,country,scope.reason]),/signature invalid/i,'forged HMAC');
  const wrongActor=actor+100000, wrong=sign(wrongActor,'commercial.document.authority.manage',scope);
  await denied(gateway.query(authoritySql,[wrong.actor,wrong.issued,wrong.nonce,wrong.contextText,wrong.signature,scope.action,scope.documentType,scope.documentKey,country,scope.reason]),/canonical founder authority required/i,'non-founder actor');
  const old=sign(actor,'commercial.document.authority.manage',scope,Math.floor(Date.now()/1000)-120);
  await denied(gateway.query(authoritySql,[old.actor,old.issued,old.nonce,old.contextText,old.signature,scope.action,scope.documentType,scope.documentKey,country,scope.reason]),/expired/i,'expired assertion');

  const ac={documentVersionId:document,reason:'Synthetic exact-version approval'};
  const a=sign(actor,'commercial.document.status.approve',ac);
  const approved=await gateway.query(approvalSql,[a.actor,a.issued,a.nonce,a.contextText,a.signature,document,ac.reason]);
  assert.equal(approved.rows[0].status,'approved');
  assert.equal(Number(approved.rows[0].authority_event_id),Number(grant.rows[0].authority_event_id));

  const pc={businessId:business,documentVersionId:document,countryId:country,idempotencyKey:'ci-commercial-payment-prepare-001',providerCode:'ci_test',accepted:true,expiresAt:null,requestId:'ci-commercial-workflow-001'};
  const pay=sign(actor,'commercial.payment.prepare_with_consent',pc);
  const args=[pay.actor,pay.issued,pay.nonce,pay.contextText,pay.signature,business,document,country,pc.idempotencyKey,pc.providerCode,true,null,pc.requestId];
  const prepared=await gateway.query(paymentSql,args);
  assert.equal(prepared.rows[0].attempt_status,'pending_checkout');
  assert.equal(Number(prepared.rows[0].subscription_id),Number(sub.rows[0].id));
  assert.equal(Number(prepared.rows[0].amount_minor_units),2500);
  const retry=sign(actor,'commercial.payment.prepare_with_consent',pc);
  const again=await gateway.query(paymentSql,[retry.actor,retry.issued,retry.nonce,retry.contextText,retry.signature,business,document,country,pc.idempotencyKey,pc.providerCode,true,null,pc.requestId]);
  assert.equal(again.rows[0].payment_attempt_id,prepared.rows[0].payment_attempt_id);
  assert.equal(again.rows[0].consent_event_id,prepared.rows[0].consent_event_id);

  const nc={...pc,idempotencyKey:'ci-commercial-no-consent-001',accepted:false};
  const no=sign(actor,'commercial.payment.prepare_with_consent',nc);
  await denied(gateway.query(paymentSql,[no.actor,no.issued,no.nonce,no.contextText,no.signature,business,document,country,nc.idempotencyKey,nc.providerCode,false,null,nc.requestId]),/invalid commercial payment preparation request/i,'false consent');
  const draft=await migrator.query("INSERT INTO ghm.commercial_document_version(document_type,document_key,version,title,content_sha256,jurisdiction_country_id,plan_code) VALUES('subscription_terms','ci_subscription_terms','ci-v2','Unapproved CI terms',repeat('b',64),$1,'ci_commercial_test') RETURNING id",[country]);
  const draftId=Number(draft.rows[0].id);
  await migrator.query("INSERT INTO ghm.commercial_document_status_event(document_version_id,status,source,reason) VALUES($1,'draft','ci_qualification','Unapproved fixture')",[draftId]);
  const mc={...pc,documentVersionId:draftId,idempotencyKey:'ci-commercial-unapproved-001'};
  const mismatch=sign(actor,'commercial.payment.prepare_with_consent',mc);
  await denied(gateway.query(paymentSql,[mismatch.actor,mismatch.issued,mismatch.nonce,mismatch.contextText,mismatch.signature,business,draftId,country,mc.idempotencyKey,mc.providerCode,true,null,mc.requestId]),/not currently approved/i,'unapproved exact version');

  const rc={...scope,action:'revoke',reason:'Synthetic CI authority revocation'};
  const revoke=sign(actor,'commercial.document.authority.manage',rc);
  const revoked=await gateway.query(authoritySql,[revoke.actor,revoke.issued,revoke.nonce,revoke.contextText,revoke.signature,rc.action,rc.documentType,rc.documentKey,country,rc.reason]);
  assert.equal(revoked.rows[0].event_type,'revoked');
  const post={documentVersionId:draftId,reason:'Must fail after revocation'};
  const postSig=sign(actor,'commercial.document.status.approve',post);
  await denied(gateway.query(approvalSql,[postSig.actor,postSig.issued,postSig.nonce,postSig.contextText,postSig.signature,draftId,post.reason]),/authority is not currently granted/i,'revoked authority');

  const final=await migrator.query(
    `SELECT s.lifecycle_status,a.attempt_status,
      (SELECT count(*) FROM ghm.commercial_consent_event WHERE idempotency_key=$1) consent_count,
      (SELECT count(*) FROM ghm.commercial_payment_attempt WHERE idempotency_key=$1) attempt_count,
      (SELECT count(*) FROM ghm.commercial_document_status_event WHERE document_version_id=$2 AND status='approved') approval_count
     FROM ghm.commercial_subscription s JOIN ghm.commercial_payment_attempt a ON a.subscription_id=s.id
     WHERE a.idempotency_key=$1`,[pc.idempotencyKey,document]);
  assert.equal(final.rowCount,1);
  assert.equal(final.rows[0].lifecycle_status,'trialing');
  assert.equal(final.rows[0].attempt_status,'pending_checkout');
  assert.equal(Number(final.rows[0].consent_count),1);
  assert.equal(Number(final.rows[0].attempt_count),1);
  assert.equal(Number(final.rows[0].approval_count),1);
  console.log(JSON.stringify({qualification:'commercial founder authority → document approval → consent → payment preparation',status:'PASS',databasePrincipal:identity.rows[0].session_user,checks:['synthetic founder bootstrap','scoped grant','replay/forgery/non-founder/expiry denial','exact version approval','explicit consent payment preparation','idempotent retry','false consent and unapproved version denial','revocation blocks approval','subscription remains trialing; payment remains pending_checkout'],productionDatabaseTouched:false,providerApiCalled:false},null,2));
} finally { await Promise.allSettled([gateway.end(),migrator.end()]); }
