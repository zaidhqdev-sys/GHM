import type { Pool } from 'pg';

export interface ConnectServiceAssertionReplayStore {
  consume(requestId: string, integrationId: string, expiresAt: Date): Promise<boolean>;
}

export class ConnectServiceAssertionReplayError extends Error {
  constructor(message: string) { super(message); this.name = 'ConnectServiceAssertionReplayError'; }
}

const assertIdentifier = (value: string, field: string): void => {
  if (!/^[!-~]{1,128}$/.test(value)) {
    throw new ConnectServiceAssertionReplayError(field + ' must be printable ASCII <= 128 characters');
  }
};

export class PostgresConnectServiceAssertionReplayStore implements ConnectServiceAssertionReplayStore {
  constructor(private readonly pool: Pool) {}
  async consume(requestId: string, integrationId: string, expiresAt: Date): Promise<boolean> {
    assertIdentifier(requestId, 'requestId');
    assertIdentifier(integrationId, 'integrationId');
    if (!(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      throw new ConnectServiceAssertionReplayError('expiresAt must be in the future');
    }
    const result = await this.pool.query<{ consumed: boolean }>(
      'SELECT ghm.connect_service_assertion_consume($1, $2, $3) AS consumed',
      [requestId, integrationId, expiresAt],
    );
    return result.rows[0]?.consumed === true;
  }
}

export const requireFreshConnectServiceAssertion = async (
  store: ConnectServiceAssertionReplayStore,
  requestId: string,
  integrationId: string,
  expiresAt: Date,
): Promise<void> => {
  if (!(await store.consume(requestId, integrationId, expiresAt))) {
    throw new ConnectServiceAssertionReplayError('Connect service assertion replay detected');
  }
};
