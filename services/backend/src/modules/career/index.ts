import type { CareerService } from "./service.js";
export { CareerService } from "./service.js";
export type CareerApi = Pick<CareerService, keyof CareerService>;
