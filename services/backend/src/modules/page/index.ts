import type { PageService as LegacyPageService } from "./legacy-mysql-service.js";
export { PageService } from "./service.js";
export { MongoPageService } from "./service.js";
export type PageApi = Pick<LegacyPageService, keyof LegacyPageService> & { editComposition?: import("./service.js").PageService["editComposition"] };
export { PageServiceError } from "./public.js";
