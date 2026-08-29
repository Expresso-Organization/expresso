import type { TemplateService } from "./service.js";
export { TemplateService } from "./service.js";
export { MongoTemplateService } from "./mongo-service.js";
export type TemplateApi = Pick<TemplateService, keyof TemplateService>;
