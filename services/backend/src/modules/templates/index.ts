import type { TemplateService } from "./service.js";
export { TemplateService } from "./service.js";
export type TemplateApi = Pick<TemplateService, keyof TemplateService>;
