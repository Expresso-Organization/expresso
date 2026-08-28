import type { JobBoardService } from "./board-service.js";
export { JobBoardService } from "./board-service.js";
export type JobBoardApi = Pick<JobBoardService, keyof JobBoardService>;
import type { JobMarketService } from "./service.js";
export { JobMarketService } from "./service.js";
export type JobMarketApi = Pick<JobMarketService, keyof JobMarketService>;
