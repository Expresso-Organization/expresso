import type { PublishingService as LegacyPublishingService } from "./legacy-mysql-service.js";
export { PublishingService } from "./service.js";
export { MongoPublishingService } from "./service.js";
export type PublishingApi = Pick<LegacyPublishingService, keyof LegacyPublishingService>;
export { PublishingError } from "./public.js";
