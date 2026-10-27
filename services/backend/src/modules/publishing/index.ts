import type { PublishingService as LegacyPublishingService } from "./legacy-mysql-service.js";
export { PublishingService } from "./service.js";
export { MongoPublishingService } from "./service.js";
/**
 * PDF · 덱 내보내기는 파일을 만들지 않고 가짜 경로만 저장해 걷어냈다. MySQL 시절
 * 구현에만 남아 있어 API에서 뺀다.
 */
export type PublishingApi = Omit<Pick<LegacyPublishingService, keyof LegacyPublishingService>, "submitExport" | "getExport" | "processExport">;
export { PublishingError } from "./public.js";
