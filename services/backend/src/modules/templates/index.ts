import type { TemplateService as LegacyTemplateService } from "./legacy-mysql-service.js";
export { TemplateService } from "./service.js";
export { MongoTemplateService } from "./service.js";
export type TemplateApi = Pick<LegacyTemplateService, keyof LegacyTemplateService>;
