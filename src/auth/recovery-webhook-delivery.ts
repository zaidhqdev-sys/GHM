import type { PasswordRecoveryDelivery } from './password-recovery';

export interface RecoveryDeliveryWebhookConfig {
  url: string;
  bearerToken: string;
}

export interface RecoveryDeliveryWebhookResponse {
  ok: boolean;
  status: number;
}

export type RecoveryDeliveryWebhookFetch = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<RecoveryDeliveryWebhookResponse>;

const MIN_BEARER_TOKEN_LENGTH = 32;

export const createRecoveryWebhookDelivery = (
  config: RecoveryDeliveryWebhookConfig,
  fetcher: RecoveryDeliveryWebhookFetch = globalThis.fetch as unknown as RecoveryDeliveryWebhookFetch,
): PasswordRecoveryDelivery => {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(config.url);
  } catch {
    throw new Error('Recovery delivery webhook URL is invalid');
  }
  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Recovery delivery webhook must use HTTPS');
  }
  if (!config.bearerToken || config.bearerToken.length < MIN_BEARER_TOKEN_LENGTH) {
    throw new Error('Recovery delivery webhook bearer token is not strong enough');
  }

  return {
    async deliver(input): Promise<void> {
      const response = await fetcher(parsedUrl.toString(), {
        method: 'POST',
        headers: {
          authorization: `Bearer ${config.bearerToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          event: 'quoteflow_migration_password_reset',
          accountId: input.accountId,
          email: input.email,
          recoveryToken: input.recoveryToken,
          expiresAt: input.expiresAt.toISOString(),
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        throw new Error('Recovery delivery webhook rejected the request');
      }
    },
  };
};

/**
 * Returns null until an operator explicitly configures an approved delivery endpoint.
 * No recovery token is generated or sent when delivery is not configured.
 */
export const createRecoveryWebhookDeliveryFromEnv = (
  env: Record<string, string | undefined> = process.env,
  fetcher: RecoveryDeliveryWebhookFetch = globalThis.fetch as unknown as RecoveryDeliveryWebhookFetch,
): PasswordRecoveryDelivery | null => {
  const url = env.GHM_RECOVERY_DELIVERY_WEBHOOK_URL?.trim();
  const bearerToken = env.GHM_RECOVERY_DELIVERY_WEBHOOK_TOKEN;
  if (!url && !bearerToken) return null;
  if (!url || !bearerToken) {
    throw new Error('Both recovery delivery webhook environment variables must be configured together');
  }
  return createRecoveryWebhookDelivery({ url, bearerToken }, fetcher);
};
