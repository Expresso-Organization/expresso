import type { PageService } from "./service.js";
export { PageService } from "./service.js";
export type PageApi = Pick<PageService, keyof PageService>;
export { PageServiceError } from "./public.js";
