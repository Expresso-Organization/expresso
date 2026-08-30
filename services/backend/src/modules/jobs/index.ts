import type { JobBoardService as LegacyJobBoardService } from "./legacy-mysql-board-service.js";
export { JobBoardService } from "./board-service.js";
export { MongoJobBoardService } from "./board-service.js";
export type JobBoardApi = Pick<LegacyJobBoardService, keyof LegacyJobBoardService>;
import type { JobMarketService as LegacyJobMarketService } from "./legacy-mysql-service.js";
export { JobMarketService } from "./service.js";
export { MongoJobMarketService } from "./service.js";
export { calculateExplainableMatch } from "./match-score.js";
export type JobMarketApi = Pick<LegacyJobMarketService, keyof LegacyJobMarketService>;
