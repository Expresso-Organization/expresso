import type { PageService as LegacyPageService } from "./legacy-mysql-service.js";
export { PageService } from "./service.js";
export { MongoPageService } from "./service.js";
export type PageApi = Pick<LegacyPageService, keyof LegacyPageService> & { editComposition?: import("./service.js").PageService["editComposition"]; restoreRevision?: import("./service.js").PageService["restoreRevision"] };
export { PageServiceError } from "./public.js";
