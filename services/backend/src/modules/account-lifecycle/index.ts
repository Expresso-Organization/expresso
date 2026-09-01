import type { AccountLifecycleService as LegacyAccountLifecycleService } from "./legacy-mysql-service.js";
export { AccountLifecycleService } from "./service.js";
export { MongoAccountLifecycleService } from "./service.js";
export type AccountLifecycleApi = Pick<LegacyAccountLifecycleService, keyof LegacyAccountLifecycleService>;
export { AccountLifecycleError } from "./public.js";
