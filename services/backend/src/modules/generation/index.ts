import type { GenerationService as LegacyGenerationService } from "./legacy-mysql-service.js";
export { MongoGenerationService } from "./service.js";
export { GenerationService } from "./service.js";
export type GenerationApi = Pick<LegacyGenerationService, keyof LegacyGenerationService>;
export { GenerationError, buildWriterContext } from "./public.js";
