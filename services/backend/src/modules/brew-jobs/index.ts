import type { BrewJobStatus } from "@expresso/contracts";
import type { BrewJobService as LegacyBrewJobService } from "./legacy-mysql-service.js";
export { BrewJobService, brewJobStatus } from "./service.js";
export { MongoBrewJobService } from "./service.js";
/** 옛 MySQL 구현의 메서드에 Mongo 구현에만 있는 것을 더한다. */
export type BrewJobApi = Pick<LegacyBrewJobService, keyof LegacyBrewJobService> & {
  follow(userId: string, jobId: string, signal: AbortSignal): AsyncGenerator<BrewJobStatus>;
};
export { type BrewJobRunner, BrewJobError, type FailureClassifier } from "./public.js";
