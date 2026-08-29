import type { JobBoardService } from "./board-service.js";
export { JobBoardService } from "./board-service.js";
export { MongoJobBoardService } from "./mongo-board-service.js";
export type JobBoardApi = Pick<JobBoardService, keyof JobBoardService>;
import type { JobMarketService } from "./service.js";
export { JobMarketService } from "./service.js";
export { MongoJobMarketService } from "./mongo-service.js";
export { calculateExplainableMatch } from "./match-score.js";
export type JobMarketApi = Pick<JobMarketService, keyof JobMarketService>;
