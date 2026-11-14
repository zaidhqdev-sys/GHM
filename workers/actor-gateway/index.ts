import { createServer } from 'node:http';
import { handleAsNodeRequest } from 'cloudflare:node';
import { Client, type Pool, type PoolClient } from 'pg';
import { createAccessJwtVerifier } from '../../src/auth/foundation/access-jwt-verifier';
import {
  loadEs256VerificationKeys,
  verificationKeyMapFromPublicKeys,
} from '../../src/auth/foundation/es256-keys';
import { createActorGatewayApp } from '../../src/actor-gateway/app';
import { PostgresActorIdentityReader } from '../../src/actor-gateway/actor-identity-reader';
import { PostgresBusinessRegistrationIdentityReader } from '../../src/actor-gateway/business-registration-identity-reader';
import { PostgresCapabilityGovernanceReader } from '../../src/actor-gateway/capability-governance-reader';
import { PostgresSupplierClassificationReader } from '../../src/actor-gateway/supplier-classification-reader';
import { PostgresBusinessProfileReader } from '../../src/actor-gateway/business-profile-reader';
import { PostgresGatewayCapabilityMutationReader } from '../../src/actor-gateway/business-capability-mutation-reader';
import { PostgresSavedBusinessGatewayReader } from '../../src/actor-gateway/saved-business-reader';
import { PostgresBusinessHoursGatewayReader } from '../../src/actor-gateway/business-hours-reader';
import { PostgresTrustScoreGatewayReader } from '../../src/actor-gateway/trust-score-reader';
import { PostgresBusinessLogoGatewayReader } from '../../src/actor-gateway/business-logo-reader';
import { PostgresStorageMetadataGatewayReader } from '../../src/actor-gateway/storage-metadata-reader';
import { PostgresConnectBusinessProvisioningReader } from '../../src/actor-gateway/connect-business-provisioning-reader';
import { PostgresCampaignDirectoryReviewGatewayReader } from '../../src/actor-gateway/campaign-directory-review-reader';
import {
  assertActorGatewayDatabaseIdentity,
  type ActorGatewayDatabaseIdentity,
} from '../../src/actor-gateway/database-principal';
import {
  assertActorGatewayDatabasePrivileges,
  readActorGatewayDatabasePrivileges,
} from '../../src/actor-gateway/database-privileges';

interface HyperdriveBinding {
  connectionString: string;
}

interface ActorGatewayWorkerEnv {
  HYPERDRIVE?: HyperdriveBinding;
  GHM_JWT_ES256_PUBLIC_KEY_PEM?: string;
  GHM_JWT_ES256_KID?: string;
  GHM_JWT_ES256_PREVIOUS_PUBLIC_KEY_PEM?: string;
  GHM_JWT_ES256_PREVIOUS_KID?: string;
  GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET?: string;
}

const INTERNAL_HTTP_PORT = 8787;
const APPLICATION_NAME = 'ghm-actor-gateway-worker';

const required = (value: string | undefined, name: string): string => {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Missing required Worker binding or secret: ${name}`);
  return normalized;
};

/**
 * Reader classes use the PoolClient connect/query/release contract. Hyperdrive
 * owns the remote connection pool, so this adapter creates one node-postgres
 * Client per transaction and closes it on release, as Cloudflare recommends.
 * It intentionally does not retain sockets across Worker invocations.
 */
class HyperdriveClientPool {
  constructor(private readonly connectionString: string) {}

  async connect(): Promise<PoolClient> {
    const client = new Client({
      connectionString: this.connectionString,
      application_name: APPLICATION_NAME,
      connectionTimeoutMillis: 5_000,
    });
    await client.connect();
    let released = false;
    return Object.assign(client, {
      release: () => {
        if (released) return;
        released = true;
        void client.end().catch(() => undefined);
      },
    }) as unknown as PoolClient;
  }
}

let initialization: Promise<void> | undefined;
let actorGatewayServer: ReturnType<typeof createServer> | undefined;

const initialize = (workerEnv: ActorGatewayWorkerEnv): Promise<void> => {
  if (!initialization) {
    initialization = (async () => {
      const connectionString = required(
        workerEnv.HYPERDRIVE?.connectionString,
        'HYPERDRIVE.connectionString',
      );
      const capabilityAssertionSecret = required(
        workerEnv.GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET,
        'GHM_ACTOR_GATEWAY_CAPABILITY_ASSERTION_SECRET',
      );

      // Construct a public-key-only environment object. The Worker must never
      // receive the ES256 private key, token pepper, or issuer database URL.
      const verificationKeys = loadEs256VerificationKeys({
        GHM_JWT_ES256_PUBLIC_KEY_PEM: required(
          workerEnv.GHM_JWT_ES256_PUBLIC_KEY_PEM,
          'GHM_JWT_ES256_PUBLIC_KEY_PEM',
        ),
        GHM_JWT_ES256_KID: required(
          workerEnv.GHM_JWT_ES256_KID,
          'GHM_JWT_ES256_KID',
        ),
        GHM_JWT_ES256_PREVIOUS_PUBLIC_KEY_PEM:
          workerEnv.GHM_JWT_ES256_PREVIOUS_PUBLIC_KEY_PEM,
        GHM_JWT_ES256_PREVIOUS_KID: workerEnv.GHM_JWT_ES256_PREVIOUS_KID,
      } as NodeJS.ProcessEnv);
      const verifier = createAccessJwtVerifier(
        verificationKeyMapFromPublicKeys(verificationKeys),
      );

      // Fail closed before the HTTP listener can dispatch any request unless
      // the Hyperdrive identity and the complete Actor Gateway ACL are valid.
      const startupClient = new Client({
        connectionString,
        application_name: APPLICATION_NAME,
        connectionTimeoutMillis: 5_000,
      });
      try {
        await startupClient.connect();
        const identity = await startupClient.query<ActorGatewayDatabaseIdentity>(`
          SELECT session_user,
                 current_user,
                 r.rolcanlogin,
                 r.rolinherit,
                 r.rolsuper,
                 r.rolcreatedb,
                 r.rolcreaterole,
                 r.rolreplication,
                 r.rolbypassrls,
                 NOT EXISTS (
                   SELECT 1
                     FROM pg_auth_members m
                     JOIN pg_roles member_role ON member_role.oid = m.member
                    WHERE m.member = r.oid
                       OR (
                         m.roleid = r.oid
                         AND (
                           member_role.rolname <> 'ghm_db_user'
                           OR m.admin_option IS DISTINCT FROM true
                           OR m.inherit_option IS DISTINCT FROM false
                           OR m.set_option IS DISTINCT FROM false
                         )
                       )
                 ) AS no_untrusted_role_memberships
            FROM pg_roles r
           WHERE r.rolname = session_user
        `);
        if (!identity.rows[0]) {
          throw new Error('Actor Gateway database identity could not be resolved');
        }
        assertActorGatewayDatabaseIdentity(identity.rows[0]);
        const privileges = await readActorGatewayDatabasePrivileges(
          startupClient as unknown as Pick<Pool, 'query'>,
        );
        assertActorGatewayDatabasePrivileges(privileges);
      } finally {
        await startupClient.end().catch(() => undefined);
      }

      const pool = new HyperdriveClientPool(connectionString) as unknown as Pool;
      const app = createActorGatewayApp({
        verifier,
        actorIdentityReader: new PostgresActorIdentityReader(pool, capabilityAssertionSecret),
        businessRegistrationIdentityReader: new PostgresBusinessRegistrationIdentityReader(pool, capabilityAssertionSecret),
        capabilityGovernanceReader: new PostgresCapabilityGovernanceReader(pool, capabilityAssertionSecret),
        supplierClassificationReader: new PostgresSupplierClassificationReader(pool, capabilityAssertionSecret),
        businessProfileReader: new PostgresBusinessProfileReader(pool, capabilityAssertionSecret),
        businessCapabilityMutationReader: new PostgresGatewayCapabilityMutationReader(pool, capabilityAssertionSecret),
        savedBusinessReader: new PostgresSavedBusinessGatewayReader(pool, capabilityAssertionSecret),
        businessHoursReader: new PostgresBusinessHoursGatewayReader(pool, capabilityAssertionSecret),
        trustScoreReader: new PostgresTrustScoreGatewayReader(pool, capabilityAssertionSecret),
        businessLogoReader: new PostgresBusinessLogoGatewayReader(pool, capabilityAssertionSecret),
        storageMetadataReader: new PostgresStorageMetadataGatewayReader(pool, capabilityAssertionSecret),
        connectBusinessProvisioningReader: new PostgresConnectBusinessProvisioningReader(pool, capabilityAssertionSecret),
        campaignDirectoryReviewReader: new PostgresCampaignDirectoryReviewGatewayReader(pool, capabilityAssertionSecret),
      });

      actorGatewayServer = createServer(app);
      actorGatewayServer.listen(INTERNAL_HTTP_PORT);
    })();
  }
  return initialization;
};

export default {
  async fetch(request: Request, workerEnv: ActorGatewayWorkerEnv): Promise<Response> {
    try {
      await initialize(workerEnv);
    } catch (error) {
      console.error(JSON.stringify({
        event: 'actor_gateway_worker_startup_failed',
        error: { name: error instanceof Error ? error.name : 'UnknownError' },
      }));
      return Response.json(
        { error: 'service_unavailable' },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      );
    }

    // The server is created only after the database principal and ACL checks
    // pass. Cloudflare maps this internal port to the incoming Worker request.
    if (!actorGatewayServer) {
      return Response.json(
        { error: 'service_unavailable' },
        { status: 503, headers: { 'cache-control': 'no-store' } },
      );
    }
    return handleAsNodeRequest(INTERNAL_HTTP_PORT, request);
  },
};
