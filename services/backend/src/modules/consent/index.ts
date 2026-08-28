import type { ConsentService } from "./service.js";
export { MongoConsentService } from "./mongo-service.js";
export { ConsentService } from "./service.js";
export type ConsentApi = Pick<ConsentService, keyof ConsentService>;
export { CONTRACT_CONSENT, ConsentError, ConsentPolicyMismatch } from "./public.js";
