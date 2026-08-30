import type { ConsentService as LegacyConsentService } from "./legacy-mysql-service.js";
export { MongoConsentService } from "./service.js";
export { ConsentService } from "./service.js";
export type ConsentApi = Pick<LegacyConsentService, keyof LegacyConsentService>;
export { CONTRACT_CONSENT, ConsentError, ConsentPolicyMismatch } from "./public.js";
