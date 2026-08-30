import type { PageService as LegacyPageService } from "./legacy-mysql-service.js";
export { PageService } from "./service.js";
export { MongoPageService } from "./service.js";
export type PageApi = Pick<LegacyPageService, keyof LegacyPageService>;
export { PageServiceError } from "./public.js";
