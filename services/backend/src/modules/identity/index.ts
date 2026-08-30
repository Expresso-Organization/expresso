import type { IdentityService as LegacyIdentityService } from "./legacy-mysql-service.js";
export { MongoIdentityService } from "./service.js";
export { requireActiveUser } from "./mongo-user-guard.js";
export { IdentityService } from "./service.js";
export type IdentityApi = Pick<LegacyIdentityService, keyof LegacyIdentityService>;
export { type IdentityPrincipal, type IssueIdentitySessionInput, IdentityError } from "./public.js";
