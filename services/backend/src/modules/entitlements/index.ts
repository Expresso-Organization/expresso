import type { EntitlementService as LegacyEntitlementService } from "./legacy-mysql-service.js";
export { MongoEntitlementService } from "./service.js";
export { EntitlementService } from "./service.js";
export type EntitlementApi = Pick<LegacyEntitlementService, keyof LegacyEntitlementService>;
export { type KstMonthlyPeriod, KST_OFFSET_MS, kstMonthlyPeriod, kstPeriodStartsAt, usageInPeriod, METERED_CALLS, TOKEN_SUMS, capabilityEnabled, outreachGate, EntitlementSubjectNotFoundError } from "./public.js";
