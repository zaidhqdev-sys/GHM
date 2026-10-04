import { createHash } from "node:crypto";

export function createBusinessLogoProviderKey(businessId: string, objectId: string): string {
  const business = businessId.trim();
  const object = objectId.trim();
  if (!business || !object) throw new Error("storage key components must not be empty");
  const digest = createHash("sha256").update(`${business}:${object}`).digest("hex").slice(0, 24);
  return `business/${business}/logos/${digest}/${object}`;
}
