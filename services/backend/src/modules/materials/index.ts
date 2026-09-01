import type { MaterialsService as LegacyMaterialsService } from "./legacy-mysql-service.js";
export { MaterialsService } from "./service.js";
export { MongoMaterialsService } from "./service.js";
export type MaterialsApi = Pick<LegacyMaterialsService, keyof LegacyMaterialsService>;
export { MaterialsError } from "./public.js";
