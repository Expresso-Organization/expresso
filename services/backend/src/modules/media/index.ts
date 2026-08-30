import type { MediaService as LegacyMediaService } from "./legacy-mysql-service.js";
export { MediaService } from "./service.js";
export { MongoMediaService } from "./service.js";
export type MediaApi = Pick<LegacyMediaService, keyof LegacyMediaService>;
export { MediaError } from "./public.js";
