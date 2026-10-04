export const STORAGE_PROVIDER_KEY_PREFIX = "media/logos";

const SAFE_BUSINESS_ID = /^[0-9]+$/;
const SAFE_OBJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const createBusinessLogoProviderKey = (businessId: string, objectId: string): string => {
  if (!SAFE_BUSINESS_ID.test(businessId)) throw new Error("invalid storage business id");
  if (!SAFE_OBJECT_ID.test(objectId)) throw new Error("invalid storage object id");
  return `${STORAGE_PROVIDER_KEY_PREFIX}/${businessId}/${objectId}`;
};
