import type { AuthContext } from "../auth/authorization.js";
import { withAuthorizedTransaction, withTenantTransaction } from "../db/authorized-transaction.js";
import type { StorageAuthorization, StorageCaller, StorageMetadataRecord, StorageResource } from "./service.js";

export interface StorageAuthorizationTransactions {
  withTenantTransaction: typeof withTenantTransaction;
  withAuthorizedTransaction: typeof withAuthorizedTransaction;
}

export function createPostgresStorageAuthorization(
  context: AuthContext,
  transactions: StorageAuthorizationTransactions = { withTenantTransaction, withAuthorizedTransaction },
): StorageAuthorization {
  const tenantTransaction = transactions.withTenantTransaction;
  const authorizedTransaction = transactions.withAuthorizedTransaction;
  const assertBusinessManager = async (caller: StorageCaller, businessId: string): Promise<void> => {
    if (Number(caller.userId) !== context.userId || caller.businessId !== businessId) {
      throw new Error("storage access denied");
    }
    await tenantTransaction(context, Number(businessId), async (_client, _context, tenant) => {
      if (tenant.membershipRole !== "owner" && tenant.membershipRole !== "administrator") {
        throw new Error("storage management permission required");
      }
    });
  };

  return {
    async assertCanManage(caller, resource: StorageResource) {
      if (resource.type !== "business" || resource.id !== resource.businessId) {
        throw new Error("unsupported storage resource");
      }
      await assertBusinessManager(caller, resource.businessId);
    },

    async assertCanRead(caller, record: StorageMetadataRecord) {
      if (Number(caller.userId) !== context.userId) throw new Error("storage access denied");
      if (record.visibility === "public" && record.resourceType === "business" && record.resourceId === record.businessId) {
        const result = await authorizedTransaction(context, (client) =>
          client.query("SELECT 1 FROM ghm.business WHERE id = $1 AND is_active = true", [Number(record.businessId)]),
        );
        if (result.rowCount === 1) return;
      }
      await tenantTransaction(context, Number(record.businessId), async () => undefined);
    },

    async assertCanDelete(caller, record) {
      await assertBusinessManager(caller, record.businessId);
    },
  };
}
