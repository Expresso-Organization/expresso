import type { EntitlementService } from "./service.js";
export { EntitlementService } from "./service.js";
export type EntitlementApi = Pick<EntitlementService, keyof EntitlementService>;
export { type KstMonthlyPeriod, kstMonthlyPeriod, capabilityEnabled, EntitlementSubjectNotFoundError } from "./public.js";
