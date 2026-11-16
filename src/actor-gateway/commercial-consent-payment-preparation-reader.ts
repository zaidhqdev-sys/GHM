import type { Pool, PoolClient } from 'pg';
import type { CommercialProviderCode } from '../resources/commercial/contracts';
import { createActorGatewayAssertion } from './request-assertion';

export interface PrepareCommercialPaymentWithConsentInput {
  businessId: number;
  documentVersionId: number;
  countryId: number | null;
  idempotencyKey: string;
  accepted: true;
  requestId: string | null;
}

export interface CommercialConsentPaymentPreparationResult {
  paymentAttemptId: number;
  consentEventId: number;
  businessId: number;
  subscriptionId: number;
  priceId: number;
  providerCode: CommercialProviderCode;
  amountMinorUnits: number;
  currencyId: number;
  billingInterval: 'month';
  attemptStatus: string;
  idempotencyKey: string;
  expiresAt: Date | null;
}

export interface CommercialConsentPaymentPreparationReader {
  prepare(
    actorAccountId: number,
    input: PrepareCommercialPaymentWithConsentInput,
  ): Promise<CommercialConsentPaymentPreparationResult>;
}

type ConnectablePool = Pick<Pool, 'connect'>;

const INSTALLED_COMMERCIAL_PAYMENT_PROVIDERS = new Set(['payfast']);

export class PostgresCommercialConsentPaymentPreparationReader implements CommercialConsentPaymentPreparationReader {
  private readonly key: Buffer;

  constructor(
    private readonly pool: ConnectablePool,
    secret: string,
    private readonly providerCode: CommercialProviderCode,
  ) {
    const key = Buffer.from(secret, 'base64');
    if (key.length !== 32 || key.toString('base64') !== secret) {
      throw new Error('GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET must be canonical base64 for exactly 32 bytes');
    }
    if (!/^[a-z][a-z0-9_]{1,49}$/.test(providerCode) || !INSTALLED_COMMERCIAL_PAYMENT_PROVIDERS.has(providerCode)) {
      throw new Error('GHM_COMMERCIAL_PAYMENT_PROVIDER does not identify an installed payment adapter');
    }
    this.key = key;
  }

  async prepare(
    actorAccountId: number,
    input: PrepareCommercialPaymentWithConsentInput,
  ): Promise<CommercialConsentPaymentPreparationResult> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const assertion = createActorGatewayAssertion(
        this.key,
        actorAccountId,
        'commercial.payment.prepare_with_consent',
        {
          businessId: input.businessId,
          documentVersionId: input.documentVersionId,
          countryId: input.countryId,
          idempotencyKey: input.idempotencyKey,
          providerCode: this.providerCode,
          accepted: input.accepted,
          expiresAt: null,
          requestId: input.requestId,
        },
      );
      const result = await client.query<{
        payment_attempt_id: string | number;
        consent_event_id: string | number;
        business_id: string | number;
        subscription_id: string | number;
        price_id: string | number;
        provider_code: string;
        amount_minor_units: string | number;
        currency_id: string | number;
        billing_interval: 'month';
        attempt_status: string;
        idempotency_key: string;
        expires_at: Date | null;
      }>(
        'SELECT * FROM ghm.gateway_prepare_commercial_payment_with_consent($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',
        [
          actorAccountId,
          assertion.issuedAt,
          assertion.nonce,
          assertion.context,
          assertion.signature,
          input.businessId,
          input.documentVersionId,
          input.countryId,
          input.idempotencyKey,
          this.providerCode,
          input.accepted,
          null,
          input.requestId,
        ],
      );
      if (result.rowCount !== 1) {
        throw Object.assign(new Error('Commercial consent/payment preparation returned no row'), { code: 'P0001' });
      }
      const row = result.rows[0];
      await client.query('COMMIT');
      return {
        paymentAttemptId: Number(row.payment_attempt_id),
        consentEventId: Number(row.consent_event_id),
        businessId: Number(row.business_id),
        subscriptionId: Number(row.subscription_id),
        priceId: Number(row.price_id),
        providerCode: row.provider_code,
        amountMinorUnits: Number(row.amount_minor_units),
        currencyId: Number(row.currency_id),
        billingInterval: row.billing_interval,
        attemptStatus: row.attempt_status,
        idempotencyKey: row.idempotency_key,
        expiresAt: row.expires_at,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}
