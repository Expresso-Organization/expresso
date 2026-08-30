import type { CareerService as LegacyCareerService } from "./legacy-mysql-service.js";
export { CareerService } from "./service.js";
export { MongoCareerService } from "./service.js";
export { assertActiveRecordsForWrite, purgeTrashedCareerRecord } from "./mongo-record-guard.js";
export { CareerError } from "./errors.js";
export type CareerApi = Pick<LegacyCareerService, keyof LegacyCareerService>;
