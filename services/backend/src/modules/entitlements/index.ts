import type { EntitlementService as LegacyEntitlementService } from "./legacy-mysql-service.js";
export { MongoEntitlementService } from "./service.js";
export { EntitlementService } from "./service.js";
export type EntitlementApi = Pick<LegacyEntitlementService, keyof LegacyEntitlementService>;
export { type KstMonthlyPeriod, kstMonthlyPeriod, capabilityEnabled, EntitlementSubjectNotFoundError } from "./public.js";
