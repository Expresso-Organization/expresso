import type { MaterialsService } from "./service.js";
export { MaterialsService } from "./service.js";
export { MongoMaterialsService } from "./mongo-service.js";
export type MaterialsApi = Pick<MaterialsService, keyof MaterialsService>;
export { MaterialsError } from "./public.js";
