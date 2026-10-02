import type { TransactionPool } from '../../db/transaction';

export type ConnectIntegrationStatus = 'active' | 'disabled' | 'revoked';

export interface ConnectIntegration {
  readonly id: string;
  readonly displayName: string;
  readonly status: ConnectIntegrationStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly disabledAt: Date | null;
  readonly revokedAt: Date | null;
}

export interface ConnectIntegrationLifecycleRepository {
  get(id: string): Promise<ConnectIntegration | null>;
}

export class ConnectIntegrationLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectIntegrationLifecycleError';
  }
}

function assertIntegrationId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[!-~]{1,128}$/.test(value)) {
    throw new ConnectIntegrationLifecycleError(
      'Connect integration id must be printable ASCII ≤ 128 characters',
    );
  }
}

const mapIntegration = (row: any): ConnectIntegration => {
  if (
    row.integration_status !== 'active' &&
    row.integration_status !== 'disabled' &&
    row.integration_status !== 'revoked'
  ) {
    throw new ConnectIntegrationLifecycleError('Connect integration lifecycle state is invalid');
  }

  return {
    id: String(row.id),
    displayName: String(row.display_name),
    status: row.integration_status,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    disabledAt: row.disabled_at ? new Date(row.disabled_at) : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
  };
};

export class PostgresConnectIntegrationLifecycleRepository
  implements ConnectIntegrationLifecycleRepository {
  constructor(private readonly transactionPool: TransactionPool) {}

  async get(id: string): Promise<ConnectIntegration | null> {
    assertIntegrationId(id);
    const client = await this.transactionPool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM ghm.connect_integration_get($1)`,
        [id],
      );
      return result.rowCount === 1 ? mapIntegration(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }
}

export const requireActiveConnectIntegration = async (
  repository: ConnectIntegrationLifecycleRepository,
  integrationId: string,
): Promise<ConnectIntegration> => {
  const integration = await repository.get(integrationId);
  if (!integration) {
    throw new ConnectIntegrationLifecycleError('Connect integration is unknown');
  }
  if (integration.status !== 'active') {
    throw new ConnectIntegrationLifecycleError('Connect integration is not active');
  }
  return integration;
};

