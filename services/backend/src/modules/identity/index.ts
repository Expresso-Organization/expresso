import type { IdentityService as LegacyIdentityService } from "./legacy-mysql-service.js";
export { MongoIdentityService } from "./service.js";
export { requireActiveUser } from "./mongo-user-guard.js";
export { IdentityService } from "./service.js";
export type IdentityApi = Pick<LegacyIdentityService, keyof LegacyIdentityService>;
export { type IdentityPrincipal, type IssueIdentitySessionInput, type SignupInput, IdentityError } from "./public.js";
export type { IdentityServiceOptions } from "./service.js";
